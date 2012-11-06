var MozillaPrograms = {
	"columns":
		["projectName", "attributeName", "attributeValue"],
	"data":[
		["Boot2Gecko (B2G)", "cf_blocking_basecamp", "+"],
		["Security", "status_whiteboard.tokenized", "sg:dos"],
		["Security", "status_whiteboard.tokenized", "sg:low"],
		["Security", "status_whiteboard.tokenized", "sg:mod"],
		["Security", "status_whiteboard.tokenized", "sg:high"],
		["Security", "status_whiteboard.tokenized", "sg:crit"],
		["Security", "keywords", "sec-critical"],
		["Security", "keywords", "sec-high"],
		["Security", "keywords", "sec-moderate"],
		["Security", "keywords", "sec-low"],
		["Security (High and Critical Only)", "status_whiteboard.tokenized", "sg:crit"],
		["Security (High and Critical Only)", "status_whiteboard.tokenized", "sg:high"],
		["Security (High and Critical Only)", "keywords", "sec-high"],
		["Security (High and Critical Only)", "keywords", "sec-critical"],
		["Crash", "keywords", "topcrash"],			//Robert Kaiser PULLS HIS METRICS USING THIS 
		["Crash", "keywords", "crash"],
		["Crash", "keywords", "regression"],
		["Top Crash", "keywords", "topcrash"],		//THE KEYWORD IS ADDED AND REMOVED TO KEEP ABOUT 100 MARKED
		["QA Wanted", "keywords", "qawanted"],
		["Regression", "status_whiteboard.tokenized", "regression-window-wanted"],
		["Regression", "status_whiteboard.tokenized", "regressionwindow-wanted"],
		["Regression", "keywords", "regressionwindow-wanted"],
		["Regression", "keywords", "regression"],
//		["Snappy", "status_whiteboard.tokenized", "snappy:p1"],
//		["Snappy", "status_whiteboard.tokenized", "snappy:p2"],
//		["Snappy", "status_whiteboard.tokenized", "snappy:p3"],
		["Snappy", "status_whiteboard.tokenized", "snappy"],		//Lawrence Mandel: JUST CATCH ALL SNAPPY
//		["MemShrink", "status_whiteboard.tokenized", "memshrink:p1"],
//		["MemShrink", "status_whiteboard.tokenized", "memshrink:p2"],
//		["MemShrink", "status_whiteboard.tokenized", "memshrink:p3"],
		["MemShrink", "status_whiteboard.tokenized", "memshrink"],		//Nicholas Nethercote: CATCH memshrink (unconfirmed) AND ALL THE pX TOO
		["Fennec", "cf_blocking_fennec10", "+"],
		["Fennec", "cf_blocking_fennec10", "?"]
//		["K9O", "status_whiteboard.tokenized", "k9o:p1"],
//		["K9O", "status_whiteboard.tokenized", "k9o:p2"],
//		["K9O", "status_whiteboard.tokenized", "k9o:p3"],
//		["K9O", "status_whiteboard.tokenized", "k9o:p?"]
	]
};
