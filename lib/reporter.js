var os = require('os'),
    path = require('path'),
    fs = require('fs'),
    builder = require('xmlbuilder'),
    istanbul = require('istanbul');
    
var HtmlDetailedReporter = function (baseReporterDecorator, config, logger, helper, formatError) {
    'use strict';
    
	// Logger
    var log = logger.create('htmlDetailed.reporter');
    
    // Configuraton Settings
    var reporterConfig = config.htmlDetailed || {};
    var outputDir = helper.normalizeWinPath(path.resolve(config.basePath, reporterConfig.dir || '_reports/'));
    var splitResults = !!reporterConfig.splitResults ? true : false;

    // Template Settings
    var templateFile = __dirname + '/../template.html';
    var template;

    // Karma Process Variables
    var pendingFileWritings = 0;
	var fileWritingFinished = function () { };
    var allMessages = [];
    
    // Private Variables
    var passCnt = {}, skipCnt = {}, failCnt = {};
    var specResults;
    var usingPreprocessor = false;

    baseReporterDecorator(this);

	this.adapters = [function (msg) {
		allMessages.push(msg);
	}];

	this.onRunStart = function () {
        // Reset default values for each run
        setPreprocessorUsed();

        specResults = [];
        passCnt = { _combined: 0 };
        skipCnt = { _combined: 0 };
        failCnt = { _combined: 0 };
	};

	this.onBrowserStart = function(browser) {
        // Reset browser-specific values
        passCnt[browser] = 0;
        skipCnt[browser] = 0;
        failCnt[browser] = 0;
	};
	
	this.onBrowserComplete = function(browser) {
        
    };

    this.onRunComplete = function () {  
        // Read the template file      
        fs.readFile(templateFile, function(err, data) {
            if (err) {
                log.warn('Cannot read template file.\n\t' + err.message);
                template = null;
            } else {
                template = data.toString('ascii', 0, data.length);
            }                

            // Path to output file
            var outputFile;

            if (splitResults) {
                // Write results to individual, browser-specific reports
                var browsers = getBrowsers();

                // Iterate through each browser and write a report
                for (var i = 0; i < browsers.length; i++) {
                    outputFile = outputDir + '/' + browsers[i] + '/html-results.html';
                    writeSingleResults(browsers[i], outputFile, template);                
                }
            } else {
                // Write all results to a single browser report
                outputFile = outputDir + '/html-results.html';
                writeCombinedResults(outputFile, template);
            }
        });

		allMessages.length = 0;	
    };

	this.specSuccess = this.specSkipped = this.specFailure = function (browser, result) {
        // For each completed spec, add to results array
        specResults.push({browser: browser, result: result});
	};

	// Wait for writing all the reports before exiting
	this.onExit = function (done) {
		if (pendingFileWritings) {
			fileWritingFinished = done;
		} else {
			done();
		}
	};
    
    // Determine if the preprocessor was used.  If so, set flag to perform preprocessing
    function setPreprocessorUsed() {
        for (var prop in config.preprocessors) {
            if (config.preprocessors[prop].indexOf('htmlDetailed') > -1) {
                usingPreprocessor = true;
                log.debug('htmlDetailed preprocessor used');
                break;
            }
        }
    }
    
    // Get unique browsers
    function getBrowsers() {
        var browsers = [];
        
        for(var i = 0; i < specResults.length; i++) {
            if (browsers.indexOf(specResults[i].browser.name) === -1)
                browsers.push(specResults[i].browser.name);
        }
        
        return browsers;
    }
    
    // Used for writing individual browser reports
    function writeSingleResults(browser, outputFile, template) {
		pendingFileWritings++;

        helper.mkdirIfNotExists(path.dirname(outputFile), function () {

            if (!!template) {
                var formattedResults = formatResults(browser);

                template = searchReplace(template, browser);
                template = template.replace('{{Test_Results}}', formattedResults.toString({pretty:true}));
                
                fs.writeFile(outputFile, template, function (err) {
                    if (err) {
                        log.warn('Cannot write html file.\n\t' + err.message);
                    }

                    if (!--pendingFileWritings) {
                        fileWritingFinished();
                    }
                });
            }
        });
    }
    
    // Used for combining all browser results to one report
    function writeCombinedResults(outputFile, template) {
		pendingFileWritings++;

        helper.mkdirIfNotExists(path.dirname(outputFile), function () {

            if (!!template) {
                var formattedResults = formatResults();

                template = searchReplace(template);
                template = template.replace('{{Test_Results}}', formattedResults.toString({pretty:true}));
                
                fs.writeFile(outputFile, template, function (err) {
                    if (err) {
                        log.warn('Cannot write html file.\n\t' + err.message);
                    }

                    if (!--pendingFileWritings) {
                        fileWritingFinished();
                    }
                });
            }
        });
    }
    
    // Searches through template replacing all placeholders
    function searchReplace(template, browser) {
        var counts;
        
        // Replace base path for jquery and bootstrap resources
        var basePath = __dirname;
        
        // There have been occassions where, if jquery and bootstrap have already been installed, they are not installed to the dependecies folder
        // Provide check.
        if (fs.lstatSync(basePath + '/node_modules').isDirectory())
            basePath += '/node_modules'
        else 
            basePath = basePath.substring(0, basePath.indexOf('\\node_modules') + 13)
            
        // Flip slashes
        basePath = basePath.replace(/\\/g, '/');
            
        template = template.replace(/\{\{Base_Path\}\}/g, basePath);
        
        // If browser is supplied, replace for individual browser.
        // If no browser is supplied, combine results.
        if (splitResults) {
            template = template.replace(/\{\{Browser\}\}/g, '(' + browser + ')');
            counts = getCounts(browser);        
        } else { 
            template = template.replace(/\{\{Browser\}\}/g, '');
            counts = getCounts();
        }
        
        // Replace remaining placeholders
        template = template.replace('{{DateTime_Stamp}}', formatTimestamp());
        template = template.replace('{{Total_Test_Count}}', counts.totalCnt);
        template = template.replace('{{Total_Pass_Count}}', counts.passCnt);
        template = template.replace('{{Total_Skip_Count}}', counts.skipCnt);
        template = template.replace('{{Total_Fail_Count}}', counts.failCnt);
    
        return template;
    }
    
    // Performs calculations (per browser or across all browsers)
    function getCounts(browser) {
        var counts = {
                passCnt: 0,
                skipCnt: 0,
                failCnt: 0,
                totalCnt: 0
            };
        
        if (splitResults) {
            counts.passCnt = passCnt[browser];
            counts.skipCnt = skipCnt[browser];
            counts.failCnt = failCnt[browser];
        } else {
            counts.passCnt = passCnt['_combined'];
            counts.skipCnt = skipCnt['_combined'];
            counts.failCnt = failCnt['_combined'];        
        }
        
        counts.totalCnt = counts.passCnt + counts.skipCnt + counts.failCnt;
        
        return counts;
    }
    
    // Creates the timestamp
    function formatTimestamp() {
        var date = new Date();
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var minutesStr = minutes < 10 ? '0'+minutes : minutes;
        var seconds = date.getSeconds();
        var secondsStr = seconds < 10 ? '0'+seconds : seconds;
        var strTime =  hours + ':' + minutesStr + ':' + secondsStr;
    
        return strTime;
    }
    
    // Generates the xml (html table) for the report
    function formatResults(browser)
    {
        var xml = builder.create('table');
        xml.att('class', 'table');
        var header = xml.ele('tr');
        header.ele('th', '');
        header.ele('th', 'Status');
        header.ele('th', 'Test');
        
        // Add extra column for browser name
        if (!splitResults) {
            header.ele('th','Browser');
            browser = '_combined';
        }
            
        var browserResults;
        if (splitResults) {
            // Filter results by browser
            browserResults = specResults.filter(function(obj) {
                return obj.browser == browser; 
            });
        } else {
            browserResults = specResults;
        }
        
        // Iterate through each result
        for (var i = 0; i < browserResults.length; i++) {
            var result = browserResults[i].result;

            var row = xml.ele('tr');

            if (result.suite && result.suite[0] === 'Jasmine__TopLevel__Suite') {
                result.suite.shift();
            }
            var expandCell = row.ele('td', {'class':'expand'});
            
            var statusCell = row.ele('td');

            if (result.skipped) {
                skipCnt[browser]++;
                row.att('class', 'active');
                statusCell.att('class', 'status');
                statusCell.text('Skipped');

                row.ele('td', result.suite.join(' :: ') + ' :: ' + result.description);
                if (!splitResults) row.ele('td', browserResults[i].browser.name);
            }
            else if (result.success) {
                passCnt[browser]++;
                row.att('class', 'success');
                statusCell.att('class', 'status');
                statusCell.text('Passed');
                
                row.ele('td', result.suite.join(' :: ') + ' :: ' + result.description);
                if (!splitResults) row.ele('td', browserResults[i].browser.name);
            }
            else {
                failCnt[browser]++;
                row.att('class', 'danger');
                expandCell.att('rowspan', '2');
                statusCell.att('class', 'status');
                statusCell.att('rowspan', '2');
                statusCell.text('Failed');

                row.ele('td', result.suite.join(' :: ') + ' :: ' + result.description);
                if (!splitResults) row.ele('td', browserResults[i].browser.name);
                                
                var errors = '';
                result.log.forEach(function(err) {
                    errors += formatError(err) + '\r\n\r\n';
                });
                var errorRow = xml.ele('tr');
                errorRow.att('class', 'danger');
                errorRow.ele('td', {'class': 'error', 'colspan': '2'}).ele('pre').text(errors);
            }        
        }
        
        return xml;
    }
};    

HtmlDetailedReporter.$inject = ['baseReporterDecorator', 'config', 'logger', 'helper', 'formatError'];

module.exports = HtmlDetailedReporter;
