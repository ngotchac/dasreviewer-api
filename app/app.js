/**
 * Module dependencies.
 */
var express = require('express')
    , fs = require("fs")
    , jquery = fs.readFileSync(__dirname + "/vendor/jquery.min.js", "utf-8")
    , jsdom = require('jsdom')
    , request = require('request')
    , url = require('url')
    , config = require('../app/config')
    , utils = require('../app/utils')(request, jsdom, jquery)
    , Spreadsheet = require('edit-google-spreadsheet')
    , app = module.exports = express.createServer();

// Configuration
// CORS middleware
var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
};

app.configure(function(){
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(allowCrossDomain);
    app.use(app.router);
});

app.configure('development', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
    app.use(express.errorHandler());
});

// Routes
app.get('/commits', function(req, res) {

    var self = this;
        self.revisions = [];
        self.res = res;
        self.currentPage = 1;

        /** SCRAPPING CONFIG ! **/

        self.baseProjectUrl = req.query.url;
        self.xtensionsToLook = ['php', 'js', 'css', 'html', 'phtml'];
        self.startDate = new Date(req.query.date);
        self.dateFormat = req.query.redmineDateFormat;
        self.startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        self.project = req.query.project.toLowerCase();

        self.cookieJar = request.jar();
        self.cookieJar.setCookie(request.cookie('_redmine_session='+req.query.cookie), baseProjectUrl);

    utils.parseUrl(self, '/projects/'+self.project+'/repository/revisions?per_page=100', function(jQuery) {
        utils.scrapRevisions(self, jQuery, function(revisions) {

            self.totalRevisions = revisions.length;

            if(revisions.length === 0 && !self.res.headerSent) {
                self.res.writeHead(200, { 'Content-Type': 'application/json' });
                self.res.write(JSON.stringify([]));
                self.res.end();
            }

            var revisionsTreated = 0;
            console.log('There\'s '+ self.totalRevisions +' revisions to scrap!\n');

            revisions.forEach(function(revision) {
                var diffUrl = revision.url + '/diff?format=diff';
                utils.parseUrl(self, diffUrl, function(fileContent) {
                    revision.files = utils.splitPatches(fileContent, self);

                    revisionsTreated++;
                    console.log(revisionsTreated + '/' + self.totalRevisions);

                    utils.addRevision(self, revision);
                }, true);
            });

        });
        
    });

});

app.post('/comments', function(req, res) {
    var done = req.body.done;
    var date = req.body.date;
    var issues = req.body.issues;
    var revision = req.body.revision;
    var file = req.body.file;
    var status = req.body.status;
    var line = req.body.line;
    var comment = req.body.comment;
    var spreadsheetId = req.body.spreadsheetId;

    if(done === undefined ||
        date === undefined ||
        issues === undefined ||
        revision === undefined ||
        file === undefined ||
        status === undefined ||
        line === undefined ||
        spreadsheetId === undefined ||
        comment === undefined && !res.headerSent) {

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end();

        return false;
    }

    doneValue = done ? 'Done' : '';
    date = new Date(date);
    date = date.getDate() + '/' + (date.getMonth() +1) + '/' + date.getFullYear();

    Spreadsheet.load({
        debug: false,
        spreadsheetId: spreadsheetId,
        worksheetId: '1',
        // See https://github.com/extrabacon/google-oauth-jwt#specifying-options
        oauth : config.oauth

    }, function sheetReady(err, spreadsheet) {
        if(err) throw err;

        spreadsheet.receive(function(err, rows, info) {
            if(err) throw err;

            var nextRow = parseInt(info.nextRow);

            var newRow = {2: [[
                doneValue,
                date,
                issues,
                revision,
                file,
                status,
                line,
                comment
            ]]};

            var add = {};
            add[nextRow] = newRow;

            spreadsheet.add(add);

            spreadsheet.send(function(err) {
                if(err) throw err;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end();
            });
        });
    });
});

app.listen(config.express.port, function(){
    console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
