'use strict';
var NodeGeocoder = require('node-geocoder');

var options = {
  provider: 'google',

  // Optional depending on the providers
  httpAdapter: 'https', // Default
  apiKey: 'AIzaSyCPCdvGsSBIuTuh9ATjMZCojZn6VHSW5Qo', // for Mapquest, OpenCage, Google Premier
  formatter: null         // 'gpx', 'string', ...
};

var geocoder = NodeGeocoder(options);

module.exports = function(Branch) {
  Branch.observe('before save', function(ctx, next) {
    if(ctx.isNewInstance) {
      geocoder.geocode(ctx.instance.address, function(err, res) {
        if(res[0]) {
          ctx.instance.location = {
            latitude: res[0].latitude,
            longitude: res[0].longitude,
          };

          if(res[0].extra && typeof res[0].extra.googlePlaceId === 'string' && res[0].extra.googlePlaceId !== '') {
            ctx.instance.placeId = res[0].extra.googlePlaceId;
          }
        }

        next();
      })
    }
  })
};
