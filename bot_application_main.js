var restify = require('restify');
var builder = require('botbuilder');
var request = require('request');
var fs = require('fs');
var moment = require('moment');
//var chalk = require('chalk');

var adminbot = new builder.BotConnectorBot({ appId: 'YourAppId', appSecret: 'YourAppSecret' });
var welcome_dialog=new builder.CommandDialog();
var pattern=['^hello','^hi'];
var global_session;
var global_icSessionId;
var first_login_attempt=false;
var summary_string='';
var model_condition = 'https://api.projectoxford.ai/luis/v1/application?id=c634dead-90c0-4e3f-98ba-219db85f86be&subscription-key=c1ceb1f9a35f4909964de80b47602576';
var luis_dialog_condition = new builder.LuisDialog(model_condition);

var model_admin = 'https://api.projectoxford.ai/luis/v1/application?id=fd39948e-b1e7-4004-a49f-ca5087d581c6&subscription-key=c1ceb1f9a35f4909964de80b47602576';
var luis_dialog_admin = new builder.LuisDialog(model_admin);

var condition_flag;
var init_login_flag=0;
var global_job_name='';
var global_job_type='';
var global_server_time;
var global_user_name='';
var global_mapping_name='';
////////////////////////////////////////////////////////////////////////
/* Adding Root dialog*/
///////////////////////////////////////////////////////////////////////

adminbot.add('/', [

function (session, args, next) 
{
	if (!session.userData.res) 
	{		
		session.beginDialog('/welcome');
		//session.beginDialog('/LUIS_CONDITION');
			
    } 
	else
	{
		session.send("else part");
		next();
	}
},
function (session, results,next)
{
	session.send("Please wait while I am connecting to Informatica Cloud ...");
	global_session=session;
	init_login(session);
	session.beginDialog('/LUIS_ADMIN');
	
}	

]);

//////////////////////////////////////////////////////////////
/* Adding welcome dialog*/
/////////////////////////////////////////////////////////////

adminbot.add('/welcome', welcome_dialog);
welcome_dialog.matches(pattern, [function (session,args, next) {
	
	    //session.send("Hi,May I have your name please?");
		builder.Prompts.text(session,"Hi , May I have your name please?");
		//session.replaceDialog('/name');
        
    },
	function (session, results)
	{
		session.userData.name = results.response;
		builder.Prompts.text(session,"Hello **"+session.userData.name+"** how are doing today?");
		condition_flag=0;
		session.replaceDialog('/LUIS_CONDITION');
		
	}
	]);

welcome_dialog.onDefault(function (session) {
        if(first_login_attempt==false)
			session.send(" Sorry I didn't understand. Say **hi/hello** to me!");
		
    });	
	
////////////////////////////////////////////////////////////
/*Adding name dialog*/
////////////////////////////////////////////////////////////

adminbot.add('/name', [
    function (session,args,next) {
        builder.Prompts.text(session, 'May I have your Informatica Cloud user credentials in the format **( <userID/password>)** ?');
		
    },
    function (session, results) {
        session.userData.res = results.response;
		var n=session.userData.res.indexOf("/");
		if(n>0)
		{
			session.userData.username=session.userData.res.substring(0,n);
			session.userData.password=session.userData.res.substring(n+1,session.userData.res.length);
			if(session.userData.username=='' || session.userData.password=='')
			{
				session.send("Sorry **"+session.userData.name+"** That was an invalid entry.");
				session.userData.res='';
				session.userData.username='';
				session.userData.password='';
				session.replaceDialog("/name");
			}
			else
			{
				session.endDialog();
			}	
			
		}	
		else
		{
			session.send("Sorry **"+session.userData.name+"** That was an invalid entry.");
			session.userData.res='';
			session.userData.username='';
			session.userData.password='';
			session.replaceDialog("/name");
		}
		
    },
	
]);	

////////////////////////////////////////////////////////////
/*Adding LUIS dialog for mental condition*/
////////////////////////////////////////////////////////////

adminbot.add('/LUIS_CONDITION',luis_dialog_condition);
luis_dialog_condition.on('feeling', [
	function (session, args, next) 
	{
		
			if(args.entities[0].type=='good')
			{
				session.send('Great !! Nice to hear that' );
			}
			else
				session.send('Oh !! Sorry to hear that' );
		session.replaceDialog('/name');
		
		//condition_flag=1;
	}
]);	

luis_dialog_condition.on('None', [
	function (session, args, next) 
	{
		if(condition_flag!=0)
		{ 
			session.send('Sorry , I can\'t understand. Hope you are doing good.' );
			session.replaceDialog('/name');
		}
		condition_flag=1;	
	}
]);	

////////////////////////////////////////////////////////////
/*Adding LUIS dialog for Admin Activity*/
////////////////////////////////////////////////////////////

adminbot.add('/LUIS_ADMIN',luis_dialog_admin);
luis_dialog_admin.on('ShowDetails', [
    function (session, args, next) 
	{
		if(init_login_flag!=0)
		{
			var task_status='';
			for(var i in args.entities)
			{
				if(args.entities[i].type=="ItemType")
					var task= args.entities[i].entity
				else
					if(args.entities[i].type=="ItemAction")
						var task_action=args.entities[i].entity
					else
						task_status=args.entities[i].entity
			}
			switch(task) 
			{
				case 'yes':
				session.send("Please wait , while I am generating the activity summary");
				get_summary();
				break;
				
				case 'no':
				session.send("Never mind !! Let me know what you need");
				break;
				
				case 'jobs' :
				if(task_action=="list" && task_status=="failed")
				{
					session.send("Please wait , while I am Listing the failed jobs");
					list_failed_jobs();
					
				}
				if(task_action=="long time" || task_action=="long running")
				{
					session.send("Please wait , while I am finding the jobs ran for more than **1 hr.**");
					global_session=session;
					get_log_running_jobs();
				}	
				
				break;
				
				case 'mappings' :
				if(task_action=="list" && task_status=="invalid")
				{
					session.send("Please wait , while I am Listing the invalid mappings");
					list_invalid_mappings();
					
				}
				break;
				
				case 'mapping' :
				if(task_action=="details")
				{
					var n = session.message.text.split(" ");
					global_mapping_name= n[n.length - 1];
					global_session=session;
					get_mapping_details();
					session.send("Please wait , while I am getting the details of the map **"+global_mapping_name+"**");
				}
				break;
				
				case 'job' :
				if(task_action=="details")
				{
					var n = session.message.text.split(" ");
					global_job_name= n[n.length - 1];
					failed_job_details();
					session.send("Please wait , while I am getting the details of the job **"+global_job_name+"**");
				}
				if(task_action=="start" || task_action=="run")
				{
					
					if(task_status!='')
					{
						var n = session.message.text.split(" ");
						global_job_name= n[n.length - 1];
						global_job_type=task_status;
						session.send("starting the **"+global_job_type+"** job **"+global_job_name+"**");
						global_session=session;
						start_job();
						
					}
					else
					{
						session.send("Sorry you did not enter job type, Please instruct me in the format **( start <job type> job <job name> )**");
					}
					
				}
				break;
				
				case 'user' :
				if(task_action=="details")
				{
					var n = session.message.text.split(" ");
					global_user_name= n[n.length - 1];
					user_details();
					session.send("Please wait , while I am getting the details of the user **"+global_user_name+"**");
				}
				break;
				
				case 'admin':
				session.send("Please wait , while I am finding the admin users...");
				global_session=session;
				admin_details();
				break;
				
				case 'objects' :
				if(task_action=="newly added" || task_action=="newly created" )
				{
					session.send("Please wait , while I am finding the new objetcs...");
					get_new_objects();
				}
				break;
				
				default:
				session.send("You are looking for **"+task+"** I can't understand this.Please provide correct instruction");
				
				
			}	
		}
		
    }
]);	

luis_dialog_admin.on('AllDone', [
    function (session, args, result,next) {
		  session.send("Happy to help you. Have a good day. Bye!!");
		global_session=session;
		logout(session);
		session.userData.end="Y";
		session.endDialog();	
		//process.exit();
    }
  
]);

luis_dialog_admin.on('None', [
    function (session, args, next) {
	if(init_login_flag!=0)
		session.send("Sorry I could not understand your instruction !!");
    }
]);		


///////////////////////////////////////////////////////
/* Initial Login to Informatica Cloud*/
/////////////////////////////////////////////////////////

function init_login(session)
{
	global_session=session;
	request
		(
			{
				url: 'https://app.informaticaondemand.com/ma/api/v2/user/login', //URL to hit
				method: 'POST', //Specify the method
				headers: 
				{
					'Content-Type': 'application/json'
				},
				json:
				{
					'@type':'login',
					'username':session.userData.username,
					'password':session.userData.password
				}
			},do_login);
		
		
}

function do_login(error, response, body)
{
	if(error) 
	{
		global_session.send("Error in Login!!");
		console.log(error);
		global_session.send("Error in Login!!");
	} 
	else 
	{
		var json_obj=JSON.parse(JSON.stringify(body,null,2));
		//console.log(json_obj);
		global_icSessionId=json_obj.icSessionId;
		if(global_icSessionId=='' || global_icSessionId==undefined)
		{
			global_session.send("Sorry I can't login uisng the credential provided by you (**"+global_session.userData.username+"/"+global_session.userData.password+"**)");
			global_session.send(json_obj.description);
			global_session.send("Say **Hi/Hello** to me to restart the conversation");
			global_session.userData.res='';
			global_session.userData.username='';
			global_session.userData.password='';
			first_login_attempt=true;
			global_session.reset("/");
			
		}
		else
		{
			global_session.send("Thank you for providing the valid user credential. You are now logged in.");
			global_session.send("Would you like to view the summary of activities in cloud ?");
			init_login_flag=1;
			//var info="You benlong to OrgId : **"+json_obj.orgId+"**\n\r"+"Your contact number is : **"+json_obj.phone+"**\n\r"+"Your Time Zone : **"+json_obj.timezone+"**";
			//global_session.send(info);
			
			//global_session.send("Here is summary of activities on cloud");
			//get_summary();
			
			
			
		}	
		
	}
}

///////////////////////////////////////////////////////
/* Getting the summary Information*/
/////////////////////////////////////////////////////////
	
function get_summary()
{
	
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas//api/v2/server/serverTime', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},server_time);
		
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/user/', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},user_count);
		
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/activity/activityLog?rowLimit=50', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},job_count);
		
}		
function user_count(error, response, body)
{
	var user_count=0;
	if(error) 
	{
		console.log(error);
	} 
	else 
	{
		var obj=JSON.parse(body);
		for ( var i in obj)
		{
			user_count=user_count+1;
		}	
		summary_string=summary_string+"Number of active users : **"+user_count+"**\n\r";
		//global_session.send(summary_string);
		
	
	}	
}
function job_count(error, response, body)
{
	var failed_job_count=0;
	var success_job_count=0;
	var failed_job_name='';
	//console.log(body);
	var obj=JSON.parse(body);
	for(var i in obj)
	{
		if(obj[i].state=="3" || obj[i].state=="2")
		{
			failed_job_count=failed_job_count+1;
			//failed_job_name=failed_job_name+"**"+obj[i].objectName+"** :: "+obj[i].errorMsg+"\n\r";
		}
		else
		{
			success_job_count=success_job_count+1;
		}
	}
	
	summary_string=summary_string+"**Summary of last 50 job execution**\n\r"+">Total number of jobs with success status : **"+success_job_count+"**\n\r"+">Total number of jobs in failed status : **"+failed_job_count+"**\n\r"+">Total number of jobs currently running : **0**\n\r";
	
	//global_session.send(summary_string);
	//global_session.send("Please tell me if you need more details");

	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/mapping', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},count_invalid_mapping);
		
	
}
		
function server_time(error, response, body)
{
	var obj=JSON.parse(body);
	summary_string=summary_string+"Server Time : **"+obj.time +"**\n\r";
	global_server_time=obj.time;
	//global_session.send(summary_string);
	
	
}

function count_invalid_mapping(error,response,body)
{
	var invalid_mapping_count=0;
	var obj=JSON.parse(body);
	
	for(var i in obj)
	{
		if(obj[i].valid==false)
		{
			invalid_mapping_count=invalid_mapping_count+1;
		}	
	}
	//console.log(body);
	summary_string=summary_string+"Number of invalid mappings : **"+invalid_mapping_count+"**\n\r";
	global_session.send(summary_string);
	global_session.send("Please let me know if you need more details");
	
}


///////////////////////////////////////////////////////////
/* generating the List of failed Jobs */
///////////////////////////////////////////////////////////

function list_failed_jobs()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/activity/activityLog?rowLimit=50', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},crt_failed_job_list);
}
function crt_failed_job_list(error,response,body)
{
	var failed_job_name='';
	var obj=JSON.parse(body);
	var count=0;
	for(var i in obj)
	{
		if(obj[i].state=="3" || obj[i].state=="2")
		{
			count=count+1;
			failed_job_name=failed_job_name+count+". "+obj[i].objectName+"\n\r";
		}
	}
	global_session.send(failed_job_name);	
	global_session.send('Is there anything else I can help you with ?');
}


///////////////////////////////////////////////////////////
/* generating the List of invalid mappings */
///////////////////////////////////////////////////////////

function list_invalid_mappings()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/mapping', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},crt_invalid_mapping_list);
}
function crt_invalid_mapping_list(error,response,body)
{
	var invalid_mapping_name='';
	var obj=JSON.parse(body);
	var count=0;
	for(var i in obj)
	{
		if(obj[i].valid==false)
		{
			count=count+1;
			invalid_mapping_name=invalid_mapping_name+count+". "+obj[i].name+"\n\r";
		}
	}
	global_session.send(invalid_mapping_name);	
	global_session.send('Is there anything else I can help you with ?');
}


	
///////////////////////////////////////////////////////////
/* generating the Details of failed Job */
///////////////////////////////////////////////////////////	

function failed_job_details()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/activity/activityLog?rowLimit=50', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},crt_failed_job);
}
function crt_failed_job(error,response,body)
{
	var obj=JSON.parse(body);
	//console.log(body);
	var found_flag=0;
	
	for(var i in obj)
	{
		if(obj[i].objectName==global_job_name && (obj[i].state=="3" || obj[i].state=="2") )
		{
			var now  = obj[i].endTime;
			var then = obj[i].startTime;

			var ms = moment(now,"YYYY-MM-DD'T'HH:mm:ss:SSSZ").diff(moment(then,"YYYY-MM-DD'T'HH:mm:ss:SSSZ"));
			var d = moment.duration(ms);
			var s = Math.floor(d.asHours()) + moment.utc(ms).format(":mm:ss");
			var message="Job Name : **"+global_job_name+"**\n\r Started by : **"+obj[i].startedBy+"**\n\r Start time : **"+obj[i].startTime+"**\n\r End time : **"+obj[i].endTime+"** \n\r Execution Time ( hh:mm:ss ) : **"+s+"**\n\r Error message : **"+obj[i].errorMsg+"**"
			global_session.send(message);
			found_flag=1;
			//global_session.send(obj[i].objectName+" : "+obj[i].errorMsg);
			
		}
	}
	if(found_flag==0)
	{
		global_session.send('Sorry I couldn\' find any records for the job **'+global_job_name+'** during last 50 runs');
	}
	global_session.send('Is there anything else I can help you with ?');
	//global_session.send(failed_job_name);	
}

///////////////////////////////////////////////////////////
/* generating the Details of invalid mappings */
///////////////////////////////////////////////////////////	

function get_mapping_details()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/mapping', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},crt_mapping_details);
}
function crt_mapping_details(error,response,body)
{
	var invalid_mapping_name='';
	var obj=JSON.parse(body);
	var message='';
	var found_flag=0;
	
	
	for ( var i in obj)
	{
		if(obj[i].name==global_mapping_name)
		{
			message="Mapping name : **"+obj[i].name+"**\n\r"+"Created by : **"+obj[i].createdBy+"**\n\r"+"Creation time : **"+obj[i].createTime+"**\n\r"+"Last updated by : **"+obj[i].updatedBy+"**\n\r"+"Last update time : **"+obj[i].updateTime+"**\n\r";
			
			found_flag=1;
		}
	}
	
	if(found_flag==1)
	{
		global_session.send(message);
	}
	else
		global_session.send("Sorry cound find any mapping")
	
	global_session.send('Is there anything else I can help you with ?');
}



///////////////////////////////////////////////////////////
/* generating the Details of admin users */
///////////////////////////////////////////////////////////	

function admin_details()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/user/', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},crt_admin_details);
}
function crt_admin_details(error, response, body)
{
		var user_list='';
		if(error) 
		{
			console.log(error);
		} 
		else 
		{
			var obj=JSON.parse(body);
			for ( var i in obj)
			{	
				//console.log("Name : "+obj[i].name);
				for ( var j in obj[i].roles)
				{		
					if( obj[i].roles[j].name=="Admin")
					{
						//global_session.send(obj[i].roles[j].name);
						//user_list=user_list+obj[i].name+"|"+obj[i].firstName+"|"+obj[i].lastName+"\n\r";
						//user_list=user_list+obj[i].firstName+" "+obj[i].lastName+" :: "+obj[i].name+"\n\r"
						user_list=user_list+"User ID : **"+obj[i].name+"**\n\r"+"Name : **"+obj[i].firstName+" "+obj[i].lastName+"**\n\r====================================\n\r"
						
					}
					
				}
			}
			
			global_session.send("Below is the list of users having admin rights");
			global_session.send(user_list);
			global_session.send("Is there anything else I can help you with ?");
									
		}
}


///////////////////////////////////////////////////////////
/* generating the Details of users */
///////////////////////////////////////////////////////////	

function user_details()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/user/', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},crt_user_details);
}
function crt_user_details(error, response, body)
{
		var user_list='';
		var found_flag=0;
		if(error) 
		{
			console.log(error);
		} 
		else 
		{
			var obj=JSON.parse(body);
			for ( var i in obj)
			{
				if(obj[i].name==global_user_name)
				{
					user_list=user_list+"User Name : **"+obj[i].name+"**\n\r First Name : **"+obj[i].firstName+"**\n\r Last Name : **"+obj[i].lastName+"**\n\r Email address : **"+obj[i].emails+"**\n\rOrganization ID : **"+obj[i].orgId+"**\n\r Time Zone : **"+obj[i].timezone+"**"
					found_flag=1;
				}
			}

			if(found_flag==1)
				global_session.send(user_list);
			else
				global_session.send("Sorry , I couldn\'t find the user record");
			global_session.send("Is there anything else I can help you with ?");
		}
}		
			

///////////////////////////////////////////////////////////
/* generating the Details of new objects */
///////////////////////////////////////////////////////////	

function get_new_objects()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/auditlog?batchId=0&batchSize=100', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},crt_new_object_details);
}

function crt_new_object_details(error, response, body)
{
	var obj=JSON.parse(body);
	var message='';
	var found_flag=0;
	for ( var i in obj)
	{
		if(obj[i].event=='CREATE')
		{
			message=message+"Object name : **"+obj[i].objectName+"**\n\r"+"Object type : **"+obj[i].category+"**\n\r"+"Created by : **"+obj[i].username+"**\n\r=============================\n\r";
			found_flag=1;
			//var date1=dates.convert(global_server_time);
			//console.log(date1);
		}
	}
	if(found_flag==1)
		global_session.send(message);
	else
		global_session.send("No new objects found")
	global_session.send("Is there anything else I can help you with ?");
}


///////////////////////////////////////////////////////////
/* generating the list of long running jobs */
///////////////////////////////////////////////////////////	

function get_log_running_jobs()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/activity/activityLog?rowLimit=200', //URL to hit
    
			method: 'GET', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'text/xml; charset=ISO-8859-1',
				'icSessionId':global_icSessionId,
				//'Accept':'text/xml; charset=ISO-8859-1'
			}
		},crt_long_running_job);
}		

function crt_long_running_job(error, response, body)
{
	var obj=JSON.parse(body);
	var message='';
	var hrs;
	var min;
	var sec;
	var found_flag=0;
	for ( var i in obj)
	{
		
		var now  = obj[i].endTime;
		var then = obj[i].startTime;
		var ms = moment(now,"YYYY-MM-DD'T'HH:mm:ss:SSSZ").diff(moment(then,"YYYY-MM-DD'T'HH:mm:ss:SSSZ"));
		var d = moment.duration(ms);
		var s = Math.floor(d.asHours()) + moment.utc(ms).format(":mm:ss");
		if(d.hours()=='')
			hrs=0;
		else
			hrs=d.hours();
		if(d.minutes()=='')
			min=0;
		else
			min=d.minutes();
		if(	d.seconds()=='')
			sec=0
		else
			sec=d.seconds();
		if(	hrs >=1 )
		{
			message=message+"Job Name : **"+obj[i].objectName+"**\n\r Started by : **"+obj[i].startedBy+"**\n\r Start time : **"+obj[i].startTime+"**\n\r End time : **"+obj[i].endTime+"** \n\r Execution Time ( hh:mm:ss ) : **"+s+"**\n\r";
			found_flag=1;
		}
		
	}
	if(found_flag==0)
		global_session.send("No Job found which is running for more than **1 hrs. **");
	else
		global_session.send(message);
		
	global_session.send("Is there anything else I can help you with ?");
}

///////////////////////////////////////////////////////////
/* starting a job*/
///////////////////////////////////////////////////////////	

function start_job()
{
	request
	(
		{
			url: 'https://app2.informaticacloud.com/saas/api/v2/job', //URL to hit
    
			method: 'POST', //Specify the method
			headers: 
			{ //We can define headers too
				'Content-Type': 'application/json',
				'Accept':'application/json',
				'icSessionId':global_icSessionId
			},
			json:
			{
				'@type':'job',
				'taskName':global_job_name,
				'taskType':global_job_type
			}
			
		},do_start_job);
}

function do_start_job(error, response, body)
{
	if(error) 
	{
			console.log(error);
			global_session.send("Sorry I can't strat the job");
			global_session.send("Is there anything else I can help you with ?");
	} 
	else 
	{
			console.log(body);
			global_session.send("The job has been started please see the status from Informatica Cloud portal");
			global_session.send("Is there anything else I can help you with ?");
									
	}
}



///////////////////////////////////////////////////
/* Handling logout operation*/
/////////////////////////////////////////////////////

function logout(session)
{
	request
		(
			{
				url: 'https://app.informaticaondemand.com/ma/api/v2/user/logoutall', //URL to hit
				method: 'POST', //Specify the method
				headers: 
				{
					'Content-Type': 'application/json'
				},
				json:
				{
					'@type':'logout',
					'username':session.userData.username,
					'password':session.userData.password
				}
			},do_logout);
			//session.send("Logged out from user account");
			
}
function do_logout(error, response, body)
{
		if(error) 
		{
			console.log(error);
		} 
		else 
		{
			console.log(body);
									
		}
}
	
	
// Setup Restify Server
var server = restify.createServer();
server.post('/api/messages', adminbot.verifyBotFramework(), adminbot.listen());
server.listen(process.env.port || 3978, function () {
    console.log('%s listening to %s', server.name, server.url); 
});
	