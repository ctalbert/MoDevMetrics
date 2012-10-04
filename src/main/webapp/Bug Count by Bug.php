<HTML>
    <meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-1">
	<HEAD>
	</HEAD>
	<BODY>
		<script type="text/javascript" src="js/rest/RestConfig.js"></script>
		<script type="text/javascript" src="../../../lib/js/jquery-1.7.js"></script>
		<script type="text/javascript" src="js/charts/HelperFunctions.js"></script>
        <script type="text/javascript" src="js/aDate.js"></script>
        <script type="text/javascript" src="js/CNV.js"></script>

		<div id="info"></div>

		<script type="text/javascript">          
		var query = {
            "query" : {
                "filtered" : {
                    "query": {
                        "match_all" : {}
                    },
                    "filter" : {
                        "and" : [
                            {"not" : {
                                    "terms" : { "bug_status" : ["resolved", "verified", "closed"] }
                                }
                            }
                        ]
                    }
                }
            },
            "from": 0,
            "size": 20,
            "sort": [],
            "facets": {
                "Bugs per Bug": {
                    "terms": {
                        "field": "assigned_to",
                        "size": 10,
                        "order":"count"
                    }
                }
            }

    	};

		var request = $.ajax({
			url: window.ElasticSearchRestURL,
			type: "POST",
//				contentType: "application/json",
			data: JSON.stringify(query),
			dataType: "json",
//				traditional: true,
//				processData: false,
//				timeout: 100000,

			success: function( data ) {
				console.info(CNV.Object2JSON(data));
                
                var htmlSummary=CNV.ESResult2HTMLSummaries(data);
				var htmlResults=CNV.List2HTMLTable(CNV.ESResult2List(data));

				document.getElementById("info").innerHTML = htmlSummary+"<br><br>"+htmlResults;
			},

			error: function ( errorData, errorMsg, errorThrown ) { 
				document.getElementById("info").innerHTML = "Response Error.  Make sure you are connected to the MPT network."; 
			}
		});
		
		</script>
	
	</BODY>
</HTML>