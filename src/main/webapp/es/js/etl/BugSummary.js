
importScript("ETL.js");
importScript("../filters/ProgramFilter.js");


var BUG_SUMMARY={};


BUG_SUMMARY.aliasName="bug_history";
BUG_SUMMARY.typeName="bug_history";


BUG_SUMMARY.BUG_STATUS=[
	"new",
	"unconfirmed",
	"assigned",
	"resolved",
	"verified",
	"closed",
	"reopened"
];

BUG_SUMMARY.allPrograms = CNV.Table2List(MozillaPrograms);


BUG_SUMMARY.getLastUpdated=function(){
	var data=yield (ESQuery.run({
		"from":BUG_SUMMARY.aliasName,
		"select":[
			{"name":"last_request", "value":BUG_SUMMARY.aliasName+".last_modified", "operation":"maximum"}
		]
	}));
	yield (Date.newInstance(data.cube.last_request));
};


BUG_SUMMARY.makeSchema=function(){
	//MAKE SCHEMA
	BUG_SUMMARY.indexName="bug_history"+Date.now().format("yyMMdd_HHmmss");

	var config={
		"_source":{"enabled": true},
		"_all" : {"enabled" : false},
		"properties":{
			"bug_id":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"product":{"type":"string", "store":"yes", "index":"not_analyzed"},
			"product_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"component":{"type":"string", "store":"yes", "index":"not_analyzed"},
			"component_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},

			"assigned_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"closed_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"new_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"reopened_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"resolved_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"unconfirmed_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"verified_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},

			"create_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"close_time":{"type":"integer", "store":"yes", "index":"not_analyzed"},
			"modified_time":{"type":"integer", "store":"yes", "index":"not_analyzed"}
		}
	};

	//ADD MOZILLA PROGRAMS
	(yield (CUBE.calc2List({
		"from":BUG_SUMMARY.allPrograms,
		"edges":["projectName"]
	}))).list.forall(function(v,i){
		config.properties[v.projectName+"_time"]={"type":"string", "store":"yes", "index":"not_analyzed"};
	});

	var setup={
		"mappings":{
		}
	};
	setup.mappings[BUG_SUMMARY.typeName]=config;


	var data=yield (Rest.post({
		"url":ElasticSearch.baseURL+"/"+BUG_SUMMARY.indexName,
		"data":setup
	}));

	D.println(data);

//		var lastAlias;  		//THE VERSION CURRENTLY IN USE

		//GET ALL INDEXES, AND REMOVE OLD ONES, FIND MOST RECENT
	data=yield (Rest.get({url: ElasticSearch.baseURL+"/_aliases"}));
	D.println(data);

	var keys=Object.keys(data);
	for(var k=keys.length;k--;){
		var name=keys[k];
		if (!name.startsWith(BUG_SUMMARY.aliasName)) continue;
		if (name==BUG_SUMMARY.indexName) continue;

		if (BUG_SUMMARY.lastInsert===undefined || name>BUG_SUMMARY.lastInsert){
			BUG_SUMMARY.lastInsert=name;
		}//endif

		if (Object.keys(data[name].aliases).length>0){
			BUG_SUMMARY.lastAlias=name;
			continue;
		}//endif

		//OLD, REMOVE IT
		yield (Rest["delete"]({url: ElasticSearch.baseURL+"/"+name}));
	}//for
};





BUG_SUMMARY.get=function(minBug, maxBug){

	//DETERMINE IF WE ARE LOOKING AT A RANGE, OR A SPECIFIC SET, OF BUGS
	var esfilter;
	if (maxBug===undefined || maxBug==null){
		esfilter={"terms":{"bug_id":minBug}};
	}else{
		esfilter={"range":{"bug_id":{"gte":minBug, "lt":maxBug}}};
	}//endif


	var current=new ESQuery({
		"from":"bugs",
		"select":[
			{"name":"bug_id", "value":"bugs.bug_id"},
			{"name":"product", "value":"bugs.product"},
			{"name":"product_time", "value":"coalesce(get(bugs.?previous_values, 'product_change_away_ts'), bugs.created_ts)"},
			{"name":"component", "value":"bugs.component"},
			{"name":"component_time", "value":"coalesce(get(bugs.?previous_values, 'component_change_away_ts'), bugs.created_ts)"},
			{"name":"create_time", "value":"bugs.created_ts"},
			{"name":"modified_time", "value":"bugs.modified_ts"}
		],
		"esfilter":
			{"range":{"expires_on":{"gt":Date.now().ceilingDay().getMilli()}}}
	});
	ElasticSearch.injectFilter(current.esQuery, esfilter);



	
	var times=ElasticSearch.makeBasicQuery(esfilter);

	//GET THE FIRST TIME FOR EACH BUGS STATUS
	BUG_SUMMARY.BUG_STATUS.forall(function(v,i){
		times.facets[v+"_time"]={
			"terms_stats": {
				"key_field": "bug_id",
				"value_field": "modified_ts",
				"size": 100000
			},
			"facet_filter": {
				"term":{"bug_status":v}
			}
		}
	});

	//ADD FACETS TO COUNT ALL MOZILLA PROGRAMS
	(yield (CUBE.calc2List({
		"from":BUG_SUMMARY.allPrograms,
		"edges":["projectName"]
	}))).list.forall(function(v, i){
		times.facets[v.projectName+"_time"]={
			"terms_stats": {
				"key_field": "bug_id",
				"value_field": "modified_ts",
				"size": 100000
			},
			"facet_filter":{"or":[]}
		};

		var or=times.facets[v.projectName+"_time"].facet_filter.or;
		for(var j=0;j<BUG_SUMMARY.allPrograms.length;j++){
			if (BUG_SUMMARY.allPrograms[j].projectName == v.projectName){
				var name = BUG_SUMMARY.allPrograms[j].attributeName;
				var value = BUG_SUMMARY.allPrograms[j].attributeValue;
				var term = {};
				term[name] = value;
				or.push({"prefix":term});
			}//endif
		}//for
	});
	ElasticSearch.injectFilter(times, esfilter);



	status.message("Get Current Bug Info");
	var currentData=yield (current.run());

	status.message("Get Historical Timestamps");
	var timesData=yield (Rest.post({
		"url":window.ElasticSearch.queryURL,
		"data":times
	}));


	var joinItAll={
		"from":currentData.list,
		"select":[],
		"edges":[]
	};

	currentData.select.forall(function(v, i){
		joinItAll.select.push({"name":v.name, "value":v.name});
	});

	//JOIN IN ALL TIME FACETS
	var removeList=[];
	forAllKey(timesData.facets, function(k, v){
		var domainName=k.deformat()+"part";
		var s={"name":k, "value":"Util.coalesce("+domainName+".min, null)", "operation":"minimum"};
		var e={"name":domainName+"__edge", "value":"bug_id", allowNulls:true, "domain":{"name":domainName, "type":"set", "key":"term", "partitions":v.terms}};
		removeList.push(domainName+"__edge");
		joinItAll.select.push(s);
		joinItAll.edges.push(e);
	});

	var r=(yield (CUBE.calc2List(joinItAll))).list;

	//REMOVE EDGES
	for(var e=removeList.length;e--;){
		var k=removeList[e];
		for(var i=r.length;i--;) r[i][k]=undefined;
	}//for

	yield r;
};//method


BUG_SUMMARY.insert=function(reviews){
	var uid=Util.UID();
	var insert=[];
	reviews.forall(function(r, i){
		insert.push(JSON.stringify({ "create" : { "_id" : uid+"-"+i } }));
		insert.push(JSON.stringify(r));
	});
	status.message("Push review queues to ES");
	yield (Rest.post({
		"url":ElasticSearch.baseURL+"/"+BUG_SUMMARY.indexName+"/"+BUG_SUMMARY.typeName+"/_bulk",
		"data":insert.join("\n")
	}));
};//method



BUG_SUMMARY["delete"]=function(bugList){
	for(var i=0;i<bugList.length;i++){
		yield(Rest["delete"]({url: ElasticSearch.baseURL+"/"+BUG_SUMMARY.aliasName+"/"+BUG_SUMMARY.typeName+"?q=bug_id:"+bugList[i]}));
	}//for
};//method