(function() {

    'use strict';

    module.exports = function(request, jsdom, jquery) {
        var utils = {};

        /**
         * @param self The main container, containing res
         * @param url String The Url to parse data from, without the baseProjectUrl
         * @param callback(self, body, jQuery)
         */
        
        /**
         * This method will parse a given URL, and, if withoutjQuery not set to true,
         * 
         * 
         * @param  {[type]}   self
         * @param  {[type]}   url
         * @param  {Function} callback
         * @param  {[type]}   withoutjQuery
         * @return {[type]}
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

        /**
         * This method will scrap all the revisions found in the jQuery arguments
         * based on the date, set in the self object. The callback is a function that
         * will be called with the revisions Array in argument.
         * 
         * @param  {Object}   self
         * @param  {Object}   jQuery
         * @param  {Function} callback
         * @param  {Object}   revisions
         */
        utils.scrapRevisions = function(self, jQuery, callback, revisions) {
            if(revisions === undefined) {
                revisions = [];
            }

            var mainTable = jQuery('table.changesets');
            var changeLines = jQuery(mainTable).find('tr.changeset');
            var wasLast = false;
            var callbackSent = false;
            var date;
            var dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/;

            console.log('Parse page %d', self.currentPage);

            jQuery.each(changeLines, function(uK, changeLine) {
                date = jQuery(changeLine).find('td.committed_on').html();

                if(dateRegex.test(date)) {
                    date = dateRegex.exec(date)
                    if(self.dateFormat === 'fr') {
                        date = new Date(date[3], date[2]-1, date[1]);
                    } else {
                        date = new Date(date[3], date[1]-1, date[2]);
                    }
                } else {
                    date = new Date(date);
                }

                if(date.getTime() === self.startDate.getTime()) {
                    var idObj = jQuery(changeLine).find('td.id').find('a');
                    var issues = [];

                    jQuery(changeLine).find('a.issue').each(function(k, issueA) {
                        issues.push({
                            title: jQuery(issueA).attr('title'),
                            url: jQuery(issueA).attr('href')
                        });
                    });

                    if(issues.length === 0) {
                        var r = /#([0-9]+)/;
                        var matches = r.exec(jQuery(changeLine).find('td.comments').html());

                        if(matches !== null && matches.length > 0 && matches[1] !== undefined) {
                            issues.push({
                                id: matches[1]
                            });
                        }
                    }

                    revisions.push({
                        id: jQuery(idObj).html(),
                        url: jQuery(idObj).attr('href'),
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

        /**
         * This method will add a revision to self.revisions, and eventually send the
         * revisions Array if we have all the revisions expected.
         * 
         * @param {Object} self
         * @param {Object} revision
         */
        utils.addRevision = function(self, revision) {
            self.revisions.push(revision);

            if(self.revisions.length === self.totalRevisions && !self.res.headerSent) {
                self.res.writeHead(200, { 'Content-Type': 'application/json' });
                self.res.write(JSON.stringify(self.revisions));
                self.res.end();
            }
        };

        /**
         * This method will, from a patch content, split all the diff patches
         * file by file, remove the un-necessary headers, and create an Array
         * of patches.
         * 
         * @param  {String} fullPatchContent
         * @param  {Object} self
         * @return {Array}
         */
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