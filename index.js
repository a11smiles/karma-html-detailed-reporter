var os = require('os'),
    path = require('path'),
    fs = require('fs'),
    builder = require('xmlbuilder');
    
var HtmlDetailedReporter = function (baseReporterDecorator, config, logger, helper, formatError) {
    'use strict';
    
	var log = logger.create('reporter.xml');
    var reporterConfig = config.htmlDetailedReporter || {};
    var templateFile = 'template.html';
    var outputFile = helper.normalizeWinPath(path.resolve(config.basePath, reporterConfig.outputFile || 'html-results.html'));
    
    var xml;
    var template;
    var pendingFileWritings = 0;
	var fileWritingFinished = function () { };
    var allMessages = [];
    var passCnt = 0, 
        skipCnt = 0, 
        failCnt = 0;

    baseReporterDecorator(this);
    
	this.adapters = [function (msg) {
		allMessages.push(msg);
	}];

	this.onRunStart = function () {
		xml = builder.create('table');
        var header = xml.ele('tr');
        header.ele('th', 'Status');
        header.ele('td', 'Test');
	};

	this.onBrowserStart = function(browser) {
	};
	
	this.onBrowserComplete = function(browser) {
	};
    
    this.onRunComplete = function () {
		pendingFileWritings++;
		helper.mkdirIfNotExists(path.dirname(outputFile), function () {
            fs.readFile(templateFile, function(err, data) {
                if (err) {
                    log.warn('Cannot read template file.\n\t' + err.message);
                    template = null;
                } else {
                    template = data;
                }                
            })
            
            if (!!template) {
                template = template.replace('{{Total_Test_Count}}', passCnt + skipCnt + failCnt + '');
                template = template.replace('{{Total_Pass_Count}}', passCnt + '');
                template = template.replace('{{Total_Skip_Count}}', passCnt + '');
                template = template.replace('{{Total_Fail_Count}}', passCnt + '');
                template = template.replace('{{Test_Results}}', xml.end({pretty:true}));
                
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

		allMessages.length = 0;
	};

	this.specSuccess = this.specSkipped = this.specFailure = function (browser, result) {
		var row = xml.ele('tr');

		if (result.suite && result.suite[0] === 'Jasmine__TopLevel__Suite') {
			result.suite.shift();
		}
		
        var statusCell = row.ele('td');
        
        if (result.success) {
            passCnt++;
            statusCell.att('class', 'status isPass');
            
            row.ele('td', result.suite);
        }
        else if (result.skipped) {
            skipCnt++;
            statusCell.att('class', 'status isSkip');

            row.ele('td', result.suite);
        }
        else if (result.failed) {
            failCnt++;
            statusCell.att('class', 'status isFail');
            statusCell.att('rowspan', '2');

            row.ele('td', result.suite);
            
            
            var errors = '';
            result.log.forEach(function(err) {
                errors += formatError(err) + '\r\n\r\n';
            });
            xml.ele('tr').ele('td', errors);
        }
        
        
        /*
		spec.ele('Name', result.suite + ' ' + result.description + ' (' + browser.name + ')');
		//spec.ele('DisplayName', result.suite + ' ' + result.description + ' (' + browser.name + ')');

		
			spec.ele('Outcome', 'Failed');
			var errors = '';
			result.log.forEach(function (err) {
				errors += formatError(err) + '\r\n\r\n';
			});
			spec.ele('ErrorStackTrace', errors);
		}
        */
	};

	// wait for writing all the xml files, before exiting
	this.onExit = function (done) {
		if (pendingFileWritings) {
			fileWritingFinished = done;
		} else {
			done();
		}
	};
}    

HtmlDetailedReporter.$inject = ['baseReporterDecorator', 'config', 'logger', 'helper', 'formatError'];

// PUBLISH DI MODULE
module.exports = {
	'reporter:htmlDetailed': ['type', HtmlDetailedReporter]
};