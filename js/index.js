
var AWS = require('aws-sdk');
var p = { region: 'us-east-1' }

var asg = new AWS.AutoScaling(p);
var ec2 = new AWS.EC2(p);
var cf = new AWS.CloudFormation(p);

const height = 600;
const width = 600;

const serv_height = 50;
const serv_width = 180;

const vol_height = 50;
const vol_width = 180;
const delta = 2000;

const text_size = '13px';

var asg_name = '';
var stack_name = '';
var data_init = [];
var instances = [];
var vols = [];
var context;
var interval = null;
var updated_set = null;

var server_img;
var drive_img;

// start executing some code
document.addEventListener("DOMContentLoaded", function() {
	canvas = document.getElementById("discanvas");
	context = canvas.getContext("2d");

	// finally query the various pixel ratios
    devicePixelRatio = window.devicePixelRatio || 1,
    backingStoreRatio = context.webkitBackingStorePixelRatio ||
                        context.mozBackingStorePixelRatio ||
                        context.msBackingStorePixelRatio ||
                        context.oBackingStorePixelRatio ||
                        context.backingStorePixelRatio || 1,

    ratio = devicePixelRatio / backingStoreRatio;

	// upscale the canvas if the two ratios don't match
	if (devicePixelRatio !== backingStoreRatio) {

	    var oldWidth = canvas.width;
	    var oldHeight = canvas.height;

	    canvas.width = oldWidth * ratio;
	    canvas.height = oldHeight * ratio;

	    canvas.style.width = oldWidth + 'px';
	    canvas.style.height = oldHeight + 'px';

	    // now scale the context to counter
	    // the fact that we've manually scaled
	    // our canvas element
	    context.scale(ratio, ratio);

	}

	do_stacks();
});

function do_stacks(){

	cf.describeStacks({}, function(err, data){
		if(err){
			console.log(err);
		}else{
			var stacks = data.Stacks;
			if(stacks.length > 0){
				var solr_stacks = stacks.filter(function(cur){

					var type_tag = cur.Tags.filter(function(cur_tag){
						return cur_tag.Key === 'stack-type';
					})[0];

					if(type_tag){
						return type_tag.Value === 'solr'
					}
					return false;
				});

				draw_stack_choices(solr_stacks);
			}
		}
	});
}

function draw_stack_choices(stacks){

	var stacks_div = document.getElementById('stack-choices');

	stacks_div.innerHTML = "";
	for(var i = 0; i < stacks.length; i++){
		var stack_html = '<li onclick="';
		stack_html += "start('" + stacks[i].StackName + "')" + '">' + stacks[i].StackName + '</li>';
		stacks_div.innerHTML += stack_html;
	}
}

function start(_stack_name){

	stack_name = _stack_name;
	clearInterval(interval);
	instances = [];
	vols = [];

	cf.describeStackResources({
		StackName: stack_name
	}, function(err, data){
		if(err){
			console.log(err);
		}else{
			var resources = data.StackResources;
			for(var i = 0; i < resources.length; i++){
				if(resources[i].LogicalResourceId === 'AutoScalingGroupSolr'){
					asg_name = resources[i].PhysicalResourceId;
					console.log('Monitoring ASG:' + asg_name);
					break;
				}
			}

			if(!asg_name){
				console.log('No ASGs found.');
				return;
			}

			start_interval();
		}
	});
}

function start_interval(){

	// do one interation so there isn't a 2 second pause
	get_instances(draw);

	interval = setInterval(function(){

		var start = new Date();
		get_instances(function(){
			draw();
			var finish = new Date();
			console.log((finish - start) + ' ms');
		});
	}, delta);
}

function stop_monitoring(){
	clearInterval(interval);
	instances = [];
	vols = [];
}

function draw(){
	
	// clear the canvas
	drawRect('#333333', '#333333', 0, 0, width, height);

	var col_height = height / instances.length;
	for(var i = 0; i < instances.length; i++){
		var x = 10;
		var y = (col_height * (i + 1)) - (col_height / 2) - (serv_height / 2);

		// draw instances
		var bg_color = '';
		if(instances[i].LifecycleState === 'InService'){
			bg_color = '#53c653';
		}else if(instances[i].LifecycleState === 'Terminating' || instances[i].HealthStatus === 'Unhealthy'){
			bg_color = '#FB6542';
		}else if(instances[i].LifecycleState === 'Pending'){
			bg_color = '#375E97';
		}
		drawRect(bg_color, '#ffffff', x, y, serv_width, serv_height);
		

		// draw instance label
		var i_label = (i + 1) + ' - ' + instances[i].HealthStatus + ' - ' + instances[i].LifecycleState;
		context.fillStyle = '#000000';
		context.font = text_size + ' Arial';
		var sx = 10 + 10;
		var sy = (col_height * (i + 1)) - (col_height / 2) + 15;
		context.fillText(instances[i].InstanceId, sx, sy - 15);
		context.fillText(i_label, sx, sy);

		// draw volumes
		if(instances[i].vol !== null){
			drawRect('#666699', '#ffffff', x + 200, y, vol_width, vol_height);

			// draw volume label
			var v_label = instances[i].vol;
			context.fillStyle = '#000000';
			context.font = text_size + ' Arial';
			var sx = 10 + 10;
			var sy = (col_height * (i + 1)) - (col_height / 2) + 2.5;
			context.fillText(v_label, sx + 200, sy);
		}
	}

	if(vols.length > 0){
		for(var j = 0; j < vols.length; j++){
			if(vols[j].State !== 'in-use'){
				var y = (col_height * (j + 1)) - (col_height / 2) - (serv_height / 2);
				drawRect('#666699', '#ffffff', x + 400, y, vol_width, vol_height);

				var tag = vols[j].Tags.filter(function(cur){
					return cur.Key === 'acquia:solr-cloud-host';
				})[0]

				var solr_host = '';
				if(tag){
					solr_host = tag.Value;
				}

				// draw volume label
				var v_label = vols[j].VolumeId;
				context.fillStyle = '#000000';
				context.font = text_size + ' Arial';
				var sx = 10 + 10;
				var sy = (col_height * (j + 1)) - (col_height / 2) + 2.5;
				context.fillText(v_label, sx + 400, sy);
				context.fillText(solr_host.replace(/-us-east-1.sr-dev.acquia.com/g, ''), sx + 400, sy + 10);
			}
		}
	}

/*	context.fillStyle = '#000000';
	context.beginPath();
	context.moveTo(0, (col_height * (i + 1)));
	context.lineTo(width, (col_height * (i + 1)));
	context.stroke();
*/

}

function drawRect(back_color, border_color, x, y, width, height){
	context.fillStyle = back_color;
	context.fillRect(x, y, width, height);
	context.strokeRect(x, y, width, height);
}

function get_instances(cb){

	var cur = 0;
	var total;

	asg.describeAutoScalingGroups({
		AutoScalingGroupNames: [asg_name]
	}, function(err, data) {
		if (err){
			console.log(err);
		}else{
			if(data.AutoScalingGroups.length > 0 && data.AutoScalingGroups[0].Instances){
				instances = data.AutoScalingGroups[0].Instances;
				total = instances.length;

				if(instances.length === 0){
					console.log('No instances.');
					cb();
				}

				for (var i = 0; i < instances.length; i++){
					get_attached_vol(i);
				}
				
			}else{
				console.log('No asgs found with that name.');
				cb();
			}
		}
	});

	ec2.describeVolumes({
		Filters: [
			{
				Name: 'tag:acquia:persistent-volume:stack-name',
				Values: [stack_name]
			},{
				Name: 'tag:acquia:persistent-volume:logical-id',
				Values: ['AutoScalingGroupSolr']
			},{
				Name: 'availability-zone',
				Values: ['us-east-1b']
			}
		]
	}, function(err, data){
		if (err){
			console.log(err);
		}else{
			vols = data.Volumes;
		}
	});

	function get_attached_vol(index){
		ec2.describeInstances({
			InstanceIds: [instances[index].InstanceId]
		}, function(err, idata) {
			if (err){
				console.log(err);
			}else{
				var mappings = idata.Reservations[0].Instances[0].BlockDeviceMappings;
				var has_vol = false;
				for(var j = 0; j < mappings.length; j++){
					if(mappings[j].DeviceName === '/dev/sdd'){
						has_vol = true;
						instances[index].vol = mappings[j].Ebs.VolumeId
					}
				}

				if(!has_vol){
					instances[index].vol = null
				}

				cur++;
				if(cur === total){
					cb();
				}
			}
		});
	}
}

function diff_vols(a, b){
	return a.filter(function(cur_a){
	    return b.filter(function(cur_b){
	        return cur_b[key].vol == cur_a[key].vol
	    }).length == 0
	});
}

// returns elements in a and not in b
function diff(a, b, key){
	return a.filter(function(cur_a){
	    return b.filter(function(cur_b){
	        return cur_b[key] == cur_a[key]
	    }).length == 0
	});
}
