(function() {

    'use strict';

    module.exports = {
        // Configuration for the Google Spreadsheet Edition
        oauth: {
            email: '************@developer.gserviceaccount.com',
            keyFile: 'app/certificate.pem'
        },
        express: {
            port: process.env.EXPRESS_PORT || 3000,
            ip: "127.0.0.1"
        }
    };

})();