var os = require('os'),
    path = require('path'),
    fs = require('fs'),
    builder = require('xmlbuilder');
    
var HtmlDetailedReporter = function (baseReporterDecorator, config, logger, helper, formatError) {
    'use strict';
    
	var log = logger.create('reporter.xml');
    var reporterConfig = config.htmlDetailedReporter || {};
    var templateFile = __dirname + '/template.html';
    var outputFile = helper.normalizeWinPath(path.resolve(config.basePath, reporterConfig.outputFile || 'html-results.html'));
    
    var xml;
    var template;
    var pendingFileWritings = 0;
	var fileWritingFinished = function () { };
    var allMessages = [];
    var passCnt, skipCnt, failCnt;
    var specResults = [];

    baseReporterDecorator(this);
    
	this.adapters = [function (msg) {
		allMessages.push(msg);
	}];

	this.onRunStart = function () {
        passCnt = 0;
        skipCnt = 0;
        failCnt = 0;
        specResults = [];
        
		xml = builder.create('table');
        xml.att('class', 'table');
        var header = xml.ele('tr');
        header.ele('th', '');
        header.ele('th', 'Status');
        header.ele('th', 'Test');
	};

	this.onBrowserStart = function(browser) {
	};
	
	this.onBrowserComplete = function(browser) {
	};
    
    this.onRunComplete = function () {
		pendingFileWritings++;

        fs.readFile(templateFile, function(err, data) {
            if (err) {
                log.warn('Cannot read template file.\n\t' + err.message);
                template = null;
            } else {
                template = data.toString('ascii', 0, data.length);
            }                

            helper.mkdirIfNotExists(path.dirname(outputFile), function () {

                if (!!template) {
                    formatResults();
                    
                    template = template.replace('{{DateTime_Stamp}}', formatTimestamp());
                    template = template.replace('{{Total_Test_Count}}', passCnt + skipCnt + failCnt + '');
                    template = template.replace('{{Total_Pass_Count}}', passCnt + '');
                    template = template.replace('{{Total_Skip_Count}}', skipCnt + '');
                    template = template.replace('{{Total_Fail_Count}}', failCnt + '');
                    template = template.replace('{{Test_Results}}', xml.toString({pretty:true}));
                    
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
        });

		allMessages.length = 0;
	};

	this.specSuccess = this.specSkipped = this.specFailure = function (browser, result) {
        specResults.push(result);
	};

	// wait for writing all the xml files, before exiting
	this.onExit = function (done) {
		if (pendingFileWritings) {
			fileWritingFinished = done;
		} else {
			done();
		}
	};
    
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
    
    function formatResults()
    {
        for (var i = 0; i < specResults.length; i++) {
            var result = specResults[i];

            //console.log('Result:', result);   
            
            var row = xml.ele('tr');

            if (result.suite && result.suite[0] === 'Jasmine__TopLevel__Suite') {
                result.suite.shift();
            }
            var expandCell = row.ele('td', {'class':'expand'});
            
            var statusCell = row.ele('td');

            if (result.skipped) {
                skipCnt++;
                row.att('class', 'active')
                statusCell.att('class', 'status');
                statusCell.text('Skipped');

                row.ele('td', result.suite.join(' :: ') + ' :: ' + result.description);
            }
            else if (result.success) {
                passCnt++;
                row.att('class', 'success')
                statusCell.att('class', 'status');
                statusCell.text('Passed');
                
                row.ele('td', result.suite.join(' :: ') + ' :: ' + result.description);
            }
            else {
                failCnt++;
                row.att('class', 'danger')
                expandCell.att('rowspan', '2');
                statusCell.att('class', 'status');
                statusCell.att('rowspan', '2');
                statusCell.text('Failed');

                row.ele('td', result.suite.join(' :: ') + ' :: ' + result.description);
                
                var errors = '';
                result.log.forEach(function(err) {
                    errors += formatError(err) + '\r\n\r\n';
                });
                var errorRow = xml.ele('tr');
                errorRow.att('class', 'danger')
                errorRow.ele('td', {'class': 'error'}).ele('pre').text(errors);
            }        
        }
    }
}    

HtmlDetailedReporter.$inject = ['baseReporterDecorator', 'config', 'logger', 'helper', 'formatError'];

// PUBLISH DI MODULE
module.exports = {
	'reporter:htmlDetailed': ['type', HtmlDetailedReporter]
};