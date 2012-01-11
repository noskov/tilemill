var path = require('path');
var url = require('url');
var fs = require('fs');
var mapnik = require('mapnik');
var Step = require('step');
var millstone = require('millstone');

models.Datasource.prototype.sync = function(method, model, success, error) {
    if (method !== 'read') return error('Method not supported.');

    var options = model.options;
    var config = Bones.plugin.config;

    if (!options) return error(new Error('options are required.'));
    if (!options.id) return error(new Error('id is required.'));
    if (!options.project) return error(new Error('project is required.'));

    millstone.resolve({
        mml: {
            Stylesheet: [{ id: 'layer', data: '' }],
            Layer: [{
                name: options.id,
                srs: options.srs || '',
                Datasource: options
            }]
        },
        base: path.join(config.files, 'project', options.project),
        cache: path.join(config.files, 'cache')
    }, function(err, mml) {
        if (err) return error(err);

        try {
            mml.Layer[0].Datasource = _(mml.Layer[0].Datasource).defaults(options);
            var source = new mapnik.Datasource(mml.Layer[0].Datasource);

            var features = [];
            if (options.features || options.info) {
                var featureset = source.featureset();
                for (var i = 0, feat;
                    i < 1000 && (feat = featureset.next(true));
                    i++) {
                    features.push(feat.attributes());
                }
            }

            var desc = source.describe();
            var datasource = {
                id: options.id,
                project: options.project,
                url: options.file,
                fields: desc.fields,
                features: options.features ? features : [],
                type: desc.type,
                geometry_type: desc.type === 'raster' ? 'raster' : desc.geometry_type
            };

            // Process fields and calculate min/max values.
            for (var f in datasource.fields) {
                var values = _(features).pluck(f);
                var type = datasource.fields[f];
                datasource.fields[f] = { type: type };
                if (options.features || options.info) {
                    datasource.fields[f].max = type === 'String'
                        ? _(values).chain().compact().max(function(v) { return v.length }).value()
                        : _(values).chain().compact().max().value();
                    datasource.fields[f].min = type === 'String'
                        ? _(values).chain().compact().min(function(v) { return v.length }).value()
                        : _(values).chain().compact().min().value();
                }
            }
        } catch(err) {
            return error(err);
        }

        success(datasource);
    });
};
