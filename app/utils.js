(function() {

    'use strict';

    module.exports = function(request, jsdom, jquery) {
        var utils = {};

        /**
         * @param self The main container, containing res
         * @param url String The Url to parse data from, without the baseProjectUrl
         * @param callback(self, body, jQuery)
         */
        utils.parseUrl = function(self, url, callback, withoutjQuery) {
            var totalData = 0;
            var maxDataSize = 5 * 1024 * 1024;

            var parseRequest = request({url: self.baseProjectUrl + url, jar: self.cookieJar}, function(err, response, body) {
                // Error handler
                if(err && response && response.statusCode !== 200 && !self.res.headerSent) {
                    self.res.writeHead(500, err.message);
                    self.res.end();
                }

                if(withoutjQuery) {
                    callback(body);
                } else {
                    jsdom.env({
                        html: body,
                        src: [jquery],
                        done: function(err, window) {
                            if(err !== null && err.message !== undefined && err.message.length > 0 && !self.res.headerSent) {
                                self.res.writeHead(500, err.message);
                                self.res.end();
                            }

                            var jQuery = window.jQuery;

                            if(jQuery('.action-login').length > 0 && !self.res.headerSent) {
                                self.res.writeHead(401, 'Forbidden');
                                self.res.end();
                            }

                            callback(jQuery);
                        }
                    });
                }
            }).on('data', function(chunk) {
                totalData += chunk.length;

                if(totalData > maxDataSize) {
                    parseRequest.abort(); 
                    callback(null);
                }
            });
        };

        utils.scrapRevisions = function(self, jQuery, callback, revisions) {
            var $ = jQuery;

            if(revisions === undefined) {
                revisions = [];
            }

            var mainTable = $('table.changesets');
            var changeLines = $(mainTable).find('tr.changeset');
            var wasLast = false;
            var callbackSent = false;
            var date;

            console.log('Parse page %d', self.currentPage);

            $.each(changeLines, function(uK, changeLine) {
                date = new Date($(changeLine).find('td.committed_on').html());
                date = new Date(date.getFullYear(), date.getMonth(), date.getDate());

                if(date.getTime() === self.startDate.getTime()) {
                    var idObj = $(changeLine).find('td.id').find('a');
                    var issues = [];

                    $(changeLine).find('a.issue').each(function(k, issueA) {
                        issues.push({
                            title: $(issueA).attr('title'),
                            url: $(issueA).attr('href')
                        });
                    });

                    if(issues.length === 0) {
                        var r = /#([0-9]+)/;
                        var matches = r.exec($(changeLine).find('td.comments').html());

                        if(matches !== null && matches.length > 0 && matches[1] !== undefined) {
                            issues.push({
                                id: matches[1]
                            });
                        }
                    }

                    revisions.push({
                        id: $(idObj).html(),
                        url: $(idObj).attr('href'),
                        date: date,
                        issues: issues
                    });

                    wasLast = (uK === (changeLines.length-1));
                } else if(date.getTime() < self.startDate.getTime()) {
                    // We've gone too far!
                    return true;
                }
            });
            if(date !== undefined && date.getTime() >= self.startDate.getTime()) {
                self.currentPage += 1;

                utils.parseUrl(self, '/projects/'+self.project+'/repository/revisions?per_page=100&page='+self.currentPage, function(jQuery) {
                    utils.scrapRevisions(self, jQuery, callback, revisions);
                });
            } else {
                callback(revisions);
            }
        };

        utils.addRevision = function(self, revision) {
            self.revisions.push(revision);

            if(self.revisions.length === self.totalRevisions && !self.res.headerSent) {
                self.res.writeHead(200, { 'Content-Type': 'application/json' });
                self.res.write(JSON.stringify(self.revisions));
                self.res.end();
            }
        };

        utils.splitPatches = function(fullPatchContent, self) {
            var files = [];

            if(fullPatchContent === null) {
                return files;
            }

            var lines = fullPatchContent.split('\n');
            var indexfileRegex = /Index: (.*)/;
            var revisionNumberRegex = /\(revision ([0-9]+)\)/
            var lineIndex = 0;
            var totalLines = lines.length;

            while(lineIndex < totalLines) {
                var minified = false;
                var fileName = indexfileRegex.exec(lines[lineIndex])[1];
                var filePatch = [];
                var commitType = null;
                lineIndex += 2;
                if(lines[lineIndex].match(revisionNumberRegex)) {
                    if(revisionNumberRegex.exec(lines[lineIndex])[1] === '0') {
                        commitType = 'add';
                    } else {
                        commitType = 'mod';
                    }
                }
                lineIndex += 2;

                while((lineIndex < totalLines) && !(lines[lineIndex].match(indexfileRegex))) {
                    if(lines[lineIndex].length > 1000) {
                        minified = true;
                    }
                    filePatch.push(lines[lineIndex]);
                    lineIndex++;
                }

                var fileExtension = fileName.split('.')[fileName.split('.').length -1];
                if(commitType !== null && !minified && (self.xtensionsToLook.indexOf(fileExtension) !== -1)) {
                    files.push({
                        path: fileName,
                        commitType: commitType,
                        patch: filePatch.join('\n')
                    });
                }
            }


            return files;
        };

        return utils;
    }
    
})();