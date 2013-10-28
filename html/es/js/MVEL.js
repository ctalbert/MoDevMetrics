/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


importScript("aLibrary.js");


var MVEL = function(){
};




MVEL.prototype.code = function(query){
	var selectList = Array.newInstance(query.select);
	var fromPath = query.from;			//FIRST NAME IS THE INDEX
	var indexName=fromPath.split(".")[0];
	var whereClause = query.where;

	//PARSE THE fromPath
	var code = this.from(fromPath, indexName, "__loop");
	var body =
		"output=\"\";\n" +
		code.replace(
			"<CODE>",
			"if (" + this.where(whereClause) + "){" +
				this.select(selectList, fromPath, "output") +
			"}\n"
		)+
		"output;\n";

	//ADD REFERENCED CONTEXT VARIABLES
	var context=MVEL.compile.getContextVariables(indexName, body, query.isLean);

	if (body.indexOf("<BODY")>=0)
		Log.error();

	var func=MVEL.compile.uniqueFunction();
	var output = MVEL.compile.addFunctions(
		'var '+func+' = function('+indexName+'){\n' +
			context+
			body +
		'};\n' +
		func+'(_source)\n'
	);

//	if (console !== undefined && Log.note != undefined) Log.note(output);
	return output;
};//method


////////////////////////////////////////////////////////////////////////////////
// WE ASSUME THE EXPRESSION COMES FROM A select.value EXPRESSION AND IS
// VALID FROM WITHIN THE CONTEXT OF THE query
////////////////////////////////////////////////////////////////////////////////
MVEL.compile={};
MVEL.compile.UID=1000;

MVEL.compile.uniqueFunction=function(){
	return "_"+MVEL.compile.UID;
	MVEL.compile.UID++;
};//method

MVEL.compile.setValues=function(expression, constants){
	if (constants===undefined) return expression;
	constants=constants.copy();

	//EXPAND ALL CONSTANTS TO PRIMITIVE VALUES (MVEL CAN ONLY ACCEPT PRIMITIVE VALUES)
	for(var i=0;i<constants.length;i++){
		var value=constants[i].value;
		var n=constants[i].name;
		if (n.split(".").length>=3) continue;	//DO NOT GO TOO DEEP
		if (value instanceof Array) continue;  //DO NOT MESS WITH ARRAYS

		if (typeof value == "object"){
			forAllKey(value, function(k, v){
				constants.push({"name":n+"."+k, "value":v});
			});
		}//endif
	}//for

	for(i=constants.length;i--;){//REVERSE ORDER, SO LONGER NAMES ARE TESTED FIRST
		var c=constants[i];
		var s=0;
		while(true){
			s=expression.indexOf(c.name, s);
			if (s==-1) break;
			if (expression.charAt(s-1).match(/[0-9a-zA-Z_$]/g)) break;
			if (expression.charAt(s+c.name.length).match(/[0-9a-zA-Z_$]/g)) break;

			var v=MVEL.Value2MVEL(c.value);
			expression=expression.left(s)+""+v+expression.rightBut(s+c.name.length);
		}//while
	}//for

	return expression;
};//method



MVEL.compile.expression = function(expression, query, constants){
	//EXPAND EXPRESSION WITH ANY CONSTANTS
	expression=MVEL.compile.setValues(expression, constants);


	if (query===undefined) Log.error("Expecting call to MVEL.compile.expression to be given a reference to the query");
	var fromPath = query.from;			//FIRST NAME IS THE INDEX
	var indexName=fromPath.split(".")[0];
//	var whereClause = query.where;

	var context = MVEL.compile.getContextVariables(indexName, expression, query.isLean);
	if (context=="") return MVEL.compile.addFunctions(expression);

//	var body = "output = "+expression+"; output;\n";

	var func=MVEL.compile.uniqueFunction();
	var output = MVEL.compile.addFunctions(
		'var '+func+' = function('+indexName+'){\n' +
			context+
			expression + ";\n"+
		'};\n' +
		func+'(_source)\n'
	);

//	if (console !== undefined && Log.note != undefined) Log.note(output);
	return output;
};//method


MVEL.compile.getContextVariables=function(indexName, body, isLean){
	var context = "";
	var columns = ESQuery.getColumns(indexName);

	var parentVarNames={};	//ALL PARENTS OF VARIABLES WITH "." IN NAME


	columns.forall(function(c, i){
		var j=body.indexOf(c.name, 0);
		while(j>=0){
			var test1=body.substring(j-5, j+c.name.length+2);
			var test2=body.substring(j-13, j+c.name.length+2);
			var test3=body.substring(j-8, j+c.name.length+2);
			var test4=body.substring(j-14, j+c.name.length+2);
			j=body.indexOf(c.name, j+1);

			if (test1=="doc[\"" + c.name + "\"]") continue; //BUT NOT ALREADY IN USE By doc["x"]
			if (test2=="getDocValue(\"" + c.name + "\")") continue;
			if (test3=="_source." + c.name) continue;
			if (test4=="get(_source, \"" + c.name+ "\")") continue;

			function defParent(name){
				{//DO NOT MAKE THE SAME PARENT TWICE
					if(parentVarNames[name]) return;
					parentVarNames[name]=true;
				}

				if (name.indexOf(".")<0){
					context+="var "+name+" = new HashMap();\n";
				}else{
					defParent(name.split(".").leftBut(1).join("."));
					context+=name+" = new HashMap();\n";
				}//endif
			}//function

			if (isLean || c.useSource){
				if (c.name.indexOf(".")>=0){
					var parent=defParent(c.name.split(".").leftBut(1).join("."));
					context += c.name + " = getSourceValue(\""+ c.name + "\");\n";
				}else{
					context += "var " + c.name + " = _source[\"" + c.name + "\"];\n";
				}//endif
			}else{
				if (c.name.indexOf(".")>=0){
					defParent(c.name.split(".").leftBut(1).join("."));
					context += c.name + " = getDocValue(\"" + c.name + "\");\n";
				}else{
					context += "var " + c.name + " = getDocValue(\"" + c.name + "\");\n";
				}//endif
			}//endif
			break;
		}//while

	});
	return context;
};//method






// indexName NAME USED TO REFER TO HIGH LEVEL DOCUMENT
// loopVariablePrefix PREFIX FOR LOOP VARABLES
MVEL.prototype.from = function(fromPath, loopVariablePrefix){
	var loopCode = "if (<PATH>!=null){ for(<VAR> : <PATH>){\n<CODE>\n}}\n";
	this.prefixMap = [];
	var code = "<CODE>";

	var path = fromPath.split(".");

	var currPath = [];
	currPath.push(path[0]);
	this.prefixMap.unshift({"path":path[0], "variable":path[0]});   //USED TO MAKE THE TRANSLATE CONVERT bug.attachments TO bugs.?attachments
	for(var i = 1; i < path.length; i++){
		var loopVariable = loopVariablePrefix + i;
		currPath.push(path[i]);
		var pathi = String.join(currPath, ".");
//        var ifPath = String.join(currPath, ".?");
		var shortPath = this.translate(pathi);
		this.prefixMap.unshift({"path":pathi, "variable":loopVariable});

		var loop;

//        if (i==1){
//            loop = loopCode
//                .replaceAll("<VAR>", loopVariable)
//                .replaceAll("<PATH>", "getDocValue(\""+path[i]+"\")");
//        }else{
			loop = loopCode
				.replaceAll("<VAR>", loopVariable)
	//            .replaceAll("<IF_PATH>", shortIfPath)
				.replaceAll("<PATH>", shortPath);
//        }//endif
		code = code.replaceAll("<CODE>", loop);
	}//for

	return code;
};//method


MVEL.prototype.translate = function(variableName){
	var shortForm = variableName;
	for(var p = 0; p < (this.prefixMap).length; p++){
		var prefix = this.prefixMap[p].path;
		shortForm=shortForm.replaceAll(prefix+".", this.prefixMap[p].variable+".?"); //ADD NULL CHECK
		shortForm=shortForm.replaceAll(prefix+"[", this.prefixMap[p].variable+"[");
	}//for
	return shortForm;
};//method



// CREATE A PIPE DELIMITED RESULT SET
MVEL.prototype.select = function(selectList, fromPath, varName){
	var list = [];
	for(var s = 0; s < selectList.length; s++){
		var value = selectList[s].value;
		var shortForm = this.translate(value);
		list.push("Value2Pipe(" + shortForm + ")\n");
	}//for

	var output;
	if (fromPath.indexOf(".")>0){
		output =
			'if (' + varName + '!="") ' + varName + '+="|";\n' +
				varName + '+=' + String.join(list, '+"|"+') + ';\n'
			;
	}else{
		output=varName + ' = ' + String.join(list, '+"|"+') + ';\n'
	}//endif
	return output;
};//method




//STATIC SO IT CAN BE USED ELSEWHERE
MVEL.esFacet2List=function(facet, selectClause){
	//ASSUME THE .term IS JSON OBJECT WITH ARRAY OF RESULT OBJECTS
	var mod = selectClause.length;
	var output = [];
	var T = facet.terms;
	for(var i = T.length; i--;){
		if (T[i].term == "") continue;		//NO DATA
		var V = T[i].term.split("|");
		var value = {};
		for(var v = V.length; v--;){
			value[selectClause[v % mod].name] = CNV.Pipe2Value(V[v]);
			if ((v % mod) == 0){
				output.push(value);
				value = {};
			}//endif
		}//for
	}//for
	return output;
};//method



// PASS esFilter SIMPLIFIED ElasticSearch FILTER OBJECT
// RETURN MVEL EXPRESSION
MVEL.prototype.where = function(esFilter){
	if (esFilter === undefined) return "true";

	var output = "";

	var keys = Object.keys(esFilter);
	if (keys.length != 1) Log.error("Expecting only one filter aggregate");
	var op = keys[0];
	if (op == "and"){
		var list = esFilter[op];
		if (list.length == 0) Log.error("Expecting something in 'and' array");
		if (list.length == 1) return this.where(list[0]);
		for(var i = 0; i < list.length; i++){
			if (output != "") output += " && ";
			output += "(" + this.where(list[i]) + ")";
		}//for
		return output;
	} else if (op == "or"){
		var list = esFilter[op];
		if (list.length == 0) Log.error("Expecting something in 'or' array");
		if (list.length == 1) return this.where(list[0]);
		for(var i = 0; i < list.length; i++){
			if (output != "") output += " || ";
			output += "(" + this.where(list[i]) + ")";
		}//for
		return output;
	} else if (op == "not"){
		return "!(" + this.where(esFilter[op]) + ")";
	} else if (op == "term"){
		var pair = esFilter[op];
		var variableName = Object.keys(pair)[0];
		var value = pair[variableName];
		return this.translate(variableName) + "==" + MVEL.Value2MVEL(value);
	} else if (op == "terms"){
		var pair = esFilter[op];
		var variableName = Object.keys(pair)[0];
		var valueList = pair[variableName];
		if (valueList.length == 0) Log.error("Expecting something in 'terms' array");
		if (valueList.length == 1) return this.translate(variableName) + "==" + MVEL.Value2MVEL(valueList[0]);
		for(var i = 0; i < valueList.length; i++){
			if (output != "") output += " || ";
			output += "(" + this.translate(variableName) + "==" + MVEL.Value2MVEL(valueList[i]) + ")";
		}//for
		return output;
	}else if (op=="exists"){
		//"exists":{"field":"myField"}
		var pair = esFilter[op];
		var variableName = pair.field;
		return "(" + this.translate(variableName) + "!=null)";
	}else if (op=="missing"){
//		"missing" : {
//			"field" : "requestee",
//			"existence" : true,
//			"null_value" : true
//		}
		var fieldName=this.translate(esFilter[op].field);
		var testExistence=esFilter[op].existence;
		var testNull=esFilter[op].null_value;

		if (testExistence===undefined || testNull===undefined) Log.error("must have 'existence' and 'null_value' attributes");

		var output=[];
		if (testExistence && !testNull){
			output.push("("+fieldName.replace(".?", ".")+" == empty)");		//REMOVE THE .? SO WE REFER TO THE FIELD, NOT GET THE VALUE
		}//endif
		if (testNull){
			output.push("("+fieldName+"==null)");
		}//endif
		return output.join(" || ");
	} else if (op == "range"){
		var pair = esFilter[op];
		var variableName = Object.keys(pair)[0];
		var range = pair[variableName];
		var lower = "";
		var upper = "";

		if (!(range.gte === undefined)){
			lower = MVEL.Value2MVEL(range.gte) + "<=" + this.translate(variableName);
		} else if (!(range.gt === undefined)){
			lower = MVEL.Value2MVEL(range.gt) + "<" + this.translate(variableName);
		} else if (!(range.from == undefined)){
			if (range.include_lower == undefined || range.include_lower){
				lower = MVEL.Value2MVEL(range.from) + "<=" + this.translate(variableName);
			} else{
				lower = MVEL.Value2MVEL(range.from) + "<" + this.translate(variableName);
			}//endif
		}//endif

		if (!(range.lte === undefined)){
			upper = MVEL.Value2MVEL(range.lte) + ">=" + this.translate(variableName);
		} else if (!(range.lt === undefined)){
			upper = MVEL.Value2MVEL(range.lt) + ">" + this.translate(variableName);
		} else if (!(range.from == undefined)){
			if (range.include_lower == undefined || range.include_lower){
				upper = MVEL.Value2MVEL(range.from) + ">=" + this.translate(variableName);
			} else{
				upper = MVEL.Value2MVEL(range.from) + ">" + this.translate(variableName);
			}//endif
		}//endif

		if (upper == "" || lower == ""){
			return "(" + upper + lower + ")";
		} else{
			return "(" + upper + ") && (" + lower + ")";
		}//endif
	} else if (op=="script"){
		var script = esFilter[op].script;
		return this.translate(script);
	}else if (op=="prefix"){
		var pair = esFilter[op];
		var variableName = Object.keys(pair)[0];
		var value = pair[variableName];
		return this.translate(variableName)+".startsWith(" + CNV.String2Quote(value)+")";
	} else{
		Log.error("'" + op + "' is an unknown aggregate");
	}//endif

	return "";
};//method



//RETURN TRUE IF THE value IS JUST A NAME OF A FIELD (OR A VALUE)
MVEL.isKeyword = function(value){
	if (value===undefined || value.charAt===undefined)
		Log.error("Expecting a string");


	for(var c = 0; c < value.length; c++){
		var cc = value.charAt(c);
		if ("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_.".indexOf(cc) == -1) return false;
	}//for
	return true;
};//method

//FROM JAVASCRIPT VALUE TO MVEL EQUIVALENT
MVEL.Value2MVEL = function(value){/*comment*/
	if (value.getMilli) return value.getMilli()+" /*"+value.format("yyNNNdd HHmmss")+"*/";		//TIME
	if (value instanceof Duration)
		return value.milli+" /*"+value.toString()+"*/";	//DURATION

	if (aMath.isNumeric(value)) return "" + value;
	return CNV.String2Quote(value);
};//method

//FROM JAVASCRIPT VALUE TO ES QUERY EQUIVALENT
MVEL.Value2Query = function(value){
	if (value.getMilli) return value.getMilli();
	if (value instanceof Duration) return value.milli;

	if (aMath.isNumeric(value)) return value;
	return CNV.String2Quote(value);
};//method


//CONVERT FROM JAVASCRIPT VALUE TO ES EQUIVALENT
MVEL.Value2Value = function(value){
	if (value.getMilli) return value.getMilli();		//TIME
	if (value instanceof Duration) return value.milli;	//DURATION
	return value;
};//method


//CONVERT AN ARRAY OF PARTS{name, esfilter} TO AN MVEL EXPRESSION
MVEL.Parts2Term = function(
	indexName,  //NAME OF INDEX
	domain
){
	var mvel = new MVEL();
	mvel.from(indexName, "_loop_");
	
	var term="";
	domain.partitions.forall(function(v){
		term +=	"if (" + mvel.where(v.esfilter) + ") "+ CNV.Value2Quote(domain.getKey(v)) + ";\n else ";
	});
	var id=Util.UID();
	return {
		"head":"var _temp"+id+" = function(){"+term+CNV.Value2Quote(domain.getKey(domain.NULL)) + ";};\n",
		"body":"_temp"+id+"()"
	};
	
	//DOES NOT WORK BECAUSE THE CONTEXT VARS ARE NOT POPULATED
//	var name="__temp"+Util.UID();
//	MVEL.FUNCTIONS[name]="var "+name+" = function(){"+term+CNV.Value2Quote(domain.getKey(domain.NULL)) + ";};\n"; //ADD TO GENERAL SET OF FUNCTIONS
//	return name+"()";

};//method


MVEL.Parts2TermScript=function(indexName, domain){
	var c=MVEL.Parts2Term(indexName, domain);
	return c.head+c.body;
};




//PREPEND THE REQUIRED MVEL FUNCTIONS TO THE CODE
MVEL.compile.addFunctions=function(mvel){
	var isAdded={};			//SOME FUNCTIONS DEPEND ON OTHERS 

	var keepAdding=true;
	while(keepAdding){
		keepAdding=false;
		forAllKey(MVEL.FUNCTIONS, function(k, v){
			if (isAdded[k]) return;
			if (mvel.indexOf(k)==-1) return;
			keepAdding=true;
			isAdded[k]=v;
			mvel=v+mvel;
		});
	}//while
	return mvel;
};//method


MVEL.FUNCTIONS={
	"String2Quote":
		"var String2Quote = function(str){\n" +
			"if (!(str is String)){ str; }else{\n" +	//LAST VALUE IS RETURNED.  "return" STOPS EXECUTION COMPLETELY!
			"" + MVEL.Value2MVEL("\"") + "+" +
			"str.replace(" + MVEL.Value2MVEL("\\") + "," + MVEL.Value2MVEL("\\\\") +
			").replace(" + MVEL.Value2MVEL("\"") + "," + MVEL.Value2MVEL("\\\"") +
			").replace(" + MVEL.Value2MVEL("\'") + "," + MVEL.Value2MVEL("\\\'") + ")+" +
			MVEL.Value2MVEL("\"") + ";\n" +
			"}};\n",

	"Value2Pipe":
		'var Value2Pipe = function(value){\n' +  //SPACES ARE IMPORTANT BETWEEN "="
			"if (value==null){ \"0\" }else "+
			"if (value is ArrayList || value is org.elasticsearch.common.mvel2.util.FastList){"+
			"var out = \"\";\n"+
			"foreach (v : value) out = (out==\"\") ? v : out + \"|\" + Value2Pipe(v);\n"+
			"'a'+Value2Pipe(out);\n"+
			"}else \n" +
			"if (value is Long || value is Integer){ 'n'+value; }else \n" +
			"if (!(value is String)){ 's'+value.getClass().getName(); }else \n" +
			'"s"+value.replace("\\\\", "\\\\\\\\").replace("|", "\\\\p");'+  //CAN NOT ""+value TO MAKE NUMBER A STRING (OR EVEN TO PREPEND A STRING!)
		"};\n",

//	"replaceAll":
//		"var replaceAll = function(output, find, replace){\n" +
//			"if (output.length()==0) return output;\n"+
//			"s = output.indexOf(find, 0);\n" +
//			"while(s>=0){\n" +
//				"output=output.replace(find, replace);\n" +
//				"s=s-find.length()+replace.length();\n" +
//				"s = output.indexOf(find, s);\n" +
//			"}\n"+
//			"output;\n"+
//		'};\n',

	"floorDay":
		"var floorDay = function(value){ Math.floor(value/86400000))*86400000;};\n",

	"floorInterval":
		"var floorInterval = function(value, interval){ Math.floor((double)value/(double)interval)*interval;};\n",

	"maximum"://JUST BECAUSE MVEL'S Math.max ONLY USES Math.max(int, int).  G*DDA*NIT!
		"var maximum = function(a, b){if (a==null) b; else if (b==null) a; else if (a>b) a; else b;\n};\n",

	"minimum"://JUST BECAUSE MVEL'S Math.max ONLY USES Math.max(int, int).  G*DDA*NIT!
		"var minimum = function(a, b){if (a==null) b; else if (b==null) a; else if (a<b) a; else b;\n};\n",

	"coalesce"://PICK FIRST NOT-NULL VALUE
		"var coalesce = function(a, b){if (a==null) b; else a; \n};\n",

	"zero2null"://ES MAKES IT DIFFICULT TO DETECT NULL/MISSING VALUES, BUT WHEN DEALING WITH NUMBERS, ES DEFAULTS TO RETURNING ZERO FOR missing VALUES!!
		"var zero2null = function(a){if (a==0) null; else a; \n};\n",

	"get":	//MY OWN PERSONAL *FU* TO THE TWISTED MVEL PROPERTY ACCESS
		"var get = function(hash, key){\n"+
			"if (hash==null) null; else hash[key];\n"+
		"};\n",

	"isNumeric":
		"var isNumeric = function(value){\n"+
			"value = value + \"\";\n"+
//			"try{ value-0; }catch(e){ 0; }"+
			"var isNum = value.length()>0;"+
			"for (v : value.toCharArray()){ if (\"0123456789\".indexOf(v)==-1) isNum = false; };\n"+
			"isNum;"+
		"};\n",

	"alpha2zero":
		"var alpha2zero = function(value){\n"+
			"var output = 0;\n"+
			"if (isNumeric(value)) output = value-0;\n"+
			"return output;"+
		"};\n",

	//KANBAN SOFTWARE
	//CAN SEE QUEUE BLOCKAGES AND SEE SINGLE BLOCKERS
	

	"concat":
		"var concat = function(array){\n"+
			"if (array==null) \"\"; else {\n"+
			"var output = \"\";\n"+
			"for (v : array){ output = output+\"|\"+v+\"|\"; };\n"+
			"output;\n"+
		"}};\n",

//	"contains":
//		"var contains = function(array, value){\n"+
//			"if (array==null) false; else {\n"+
//			"var good = false;\n"+
//			"for (v : array){ if (v==value) good=true; };\n"+
//			"good;\n"+
//		"}};\n",

	"getFlagValue":  //SPECIFICALLY FOR cf_* FLAGS: CONCATENATE THE ATTRIBUTE NAME WITH ATTRIBUTE VALUE, IF EXISTS
		"var getFlagValue = function(name){\n"+
			"if (_source[name]!=null)" +
				"\" \"+name+_source[name];\n"+
			"else \n"+
				"\"\";\n"+
		"};\n",

	"getDocValue":  
		"var getDocValue = function(name){\n"+
			"var out = [];\n"+
			"var v = doc[name];\n"+
//			"if (v is org.elasticsearch.common.mvel2.ast.Function) v = v();=n" +
			"if (v==null || v.value==null) { null; } else " +
			"if (v.values.length<=1){ v.value; } else " + //ES MAKES NO DISTINCTION BETWEEN v or [v], SO NEITHER DO I
			"{for(k : v.values) out.add(k); out;}" +
		"};\n",

	"getSourceValue":
		"var getSourceValue = function(name){\n"+
			"var out = [];\n"+
			"var v = _source[name];\n"+
//			"if (v is org.elasticsearch.common.mvel2.ast.Function) v = v();=n" +
			"if (v==null) { null; } else " +
			"if (v.values.length<=1){ v.value; } else " + //ES MAKES NO DISTINCTION BETWEEN v or [v], SO NEITHER DO I
			"{for(k : v) out.add(k); out;}" +
		"};\n",

	"getDocArray":
		"var getDocArray = function(name){\n"+
			"var out = [];\n"+
			"var v = doc[name];\n"+
			"if (v!=null && v.value!=null) for(k : v.values) out.add(k);" +
			"out;" +
		"};\n",


	"milli2Month":
		"var milli2Month = function(value, milliOffset){\n"+
			"g=new java.util.GregorianCalendar(new java.util.SimpleTimeZone(0, \"GMT\"));\n"+
			"g.setTimeInMillis(value);\n"+
			"g.add(java.util.GregorianCalendar.MILLISECOND, -milliOffset);\n"+
			"m = g.get(java.util.GregorianCalendar.MONTH);\n"+
			"output = \"\"+g.get(java.util.GregorianCalendar.YEAR)+(m>9?\"\":\"0\")+m;\n"+
			"output;\n"+
		"};\n",

	"between":
		"var between = function(value, prefix, suffix){\n"+
			"if (value==null){ null; }else{\n"+
			"var start = value.indexOf(prefix, 0);\n"+
			"if (start==-1){ null; }else{\n"+
			"var end = value.indexOf(suffix, start+prefix.length());\n"+
			"if (end==-1){  null; }else{\n"+
			"value.substring(start+prefix.length(), end);\n"+
			"}}}\n"+
		"};\n"

//		g.add(GregorianCalendar.DAY_OF_MONTH, +100);
//		long t=g.getTime().getTime();
//
//		System.out.println(""+System.currentTimeMillis());
//		System.out.println(""+t);
//		int m=g.get(java.util.GregorianCalendar.MONTH);
//
//		String output=""+g.get(java.util.GregorianCalendar.YEAR)+(m>9?"":"0")+m;
//		System.out.println(output);

};


