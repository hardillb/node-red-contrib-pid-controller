/**
 * Copyright 2016 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
	"use strict";

	function PIDLoop(n) {
		RED.nodes.createNode(this, n);
		this.topic = n.topic;
		this.P = Number(n.Kp);
		this.Ti = Number(n.Ki);
		this.Td = Number(n.Kd);
		this.dt = Number(n.recalcTime);
		this.setPointTopic = n.setPointTopic;
		this.fireTopic = n.fireTopic;
		this.fixedTopic = n.fixedTopic;
		this.fixedValue = parseInt(n.fixedValue);
		this.setPoint = n.setPoint;
		this.deadBand = n.deadBand;

		this.minOutput = 0;
		this.maxOutput = 1;

		this.errorVal = 0;
		this.integral = 0;
		this.lastTimestamp = 0;

		this.fire = false;
		this.fireResetInterval;

		this.fixed =false;

		var node = this;
		if (this.setPoint) {
			node.status({text: node.setPoint});
		} else {
			node.status({});
		}

		function clearState() {
			node.lastTimestamp = 0;
			node.errorVal = 0;
			node.integral = 0;
			if (node.measured) {
				delete node.measured;
			}
			if (node.lastMeasured) {
				delete node.lastMeasured;
			}
		}

		this.on('input', function(msg){
			//console.log("%j", msg);

			if (msg.topic && msg.topic === node.setPointTopic) {
				node.setPoint = msg.payload;
				node.status({text: 'setpoint ' + node.setPoint});
			} else if (msg.topic && msg.topic === node.fireTopic) {
				if (!msg.payload) {
					node.status({text: 'FIRE', shape: 'dot', fill: 'red'});
					var newMsg = {
						topic: node.topic,
						payload: 0
					};
					node.send([newMsg,newMsg]);
					node.fireResetInterval = setTimeout(clearState,900000);
					node.fire = true;
				} else {
					node.status({text: 'setpoint ' + node.setPoint});
					node.fire = false;
					clearTimeout(node.fireResetInterval);
					delete node.fireResetInterval;
				}
			} else if (msg.topic && msg.topic === node.fixedTopic) {
				if (typeof msg.payload === 'number') {
					node.fixedValue = msg.payload;
				} else if (typeof msg.payload === 'boolean') {
					node.fixed = msg.payload;
				}

				if (node.fixed) {
					var msg = {
						topic: node.topic,
						payload: node.fixedValue
					}
					var msg2 = {
						topic: node.topic,
						payload: 0
					}
					var array = [];
					if (node.fixedValue > 0) {
						array = [msg,msg2];
					} else {
						array = [msg2,msg];
					}
					node.send(array);
					node.status({text: 'Fixed ' + node.fixedValue, fill:'green',shape:'dot'});
				} else {
					node.status({text: 'setpoint ' + node.setPoint});
				}
			} else {
				if (typeof msg.payload === 'number') {
					if (!node.lastMeasured) {
						node.lastMeasured = msg.payload;
					}

					if (node.lastMeasured != msg.payload) {
						node.lastMeasured = node.measured;
					}
					node.measured = msg.payload;

					// if (node.lastMeasured != msg.payload) {
					// 	var last = node.lastMeasured;
					// 	var now = (msg.payload + lastTimestamp)/2;
					// 	node.lastMeasured = node.measured;
					// 	node.measured = now;
					// } else {
					// 	node.measured = msg.payload;
					// }

				}
			}
		});


		this.interval = setInterval(function(){
			if (node.measured && node.lastMeasured) {

				var error = node.setPoint - node.measured;

				var deltaError = node.measured - node.lastMeasured;

				//console.log("error: " + error);
				if (Math.abs(error) < node.deadBand) {
					//console.log("in deadband");
					error = 0;
					if (node.Ti != 0) {
						//console.log("Ti not 0");
						var adjustment = (node.integral * node.P) / (node.Ti);
						//console.log(adjustment);
						//gradualy reduce integral
						node.integral -= adjustment;
						// console.log(Math.abs(node.integral));
						if (Math.abs(node.integral) < 1e-10) {
							//console.log("small enough to be zero");
							node.integral = 0;
						}
						//console.log("new deadband integral = " + node.integral);
					}
				}

				var integral = 0;
				if (node.Ti != 0) {
					integral = (error * node.dt * node.P) / (node.Ti * 100);
				} 
				//console.log("delta integral: " + integral);

				//var output = (1/node.P) * (error + (node.Td * deltaError)/node.dt) + ((node.integral * node.dt) / node.Ti);
				//console.log("(" + error + " * " + node.P + "/100) + " + node.integral );
				var output = (error * node.P/100) + node.integral;
				//console.log("raw output: " + output);

				var diff = (node.Td *deltaError)/node.dt;
				//console.log("diff:" + diff);

				

				//console.log("power: " +  output);
				if (Math.abs(output) > node.maxOutput) {
					if (output > 0) {
						output = node.maxOutput;
					} else {
						output = node.maxOutput * -1;
					}
				} else {
					if (!node.fixed) {
						node.integral = node.integral + integral;
						// if (Math.abs(node.integral) > (node.maxOutput/2)) {
						// 	if (node.integral > 0) {
						// 		node.integral = node.maxOutput/2;
						// 	} else {
						// 		node.integral = node.maxOutput * -0.5;
						// 	}
						// }
						if (Math.abs(node.integral) > (node.maxOutput)) {
							if (node.integral > 0) {
								node.integral = node.maxOutput;
							} else {
								node.integral = node.maxOutput * -1;
							}
						}
					}
					//console.log("node.integral: " + node.integral);
				}
				//console.log("pre adjust: " + output);
				output = Math.round(output * 10000) / 1000;
				//console.log("adjusted: " + output);
				//console.log("---------------");

				var msg = {
					topic: node.topic || "",
					payload: Math.abs(output)
				}

				var off = {
					topic: node.topic || "",
					payload: 0
				}

				if (!node.fixed && !node.fire) {
					if (output > 0) {
						node.send([msg,off]);

					} else {
						node.send([off,msg]);
					}
					var status = {fill:"green",shape:"ring", text: 'SP: ' + node.setPoint + " IN: " + node.measured};
					if (output > 0) {
						status.fill = "red";
					} else if (output < 0) {
						status.fill = "blue";
					}
					node.status(status);
					}


			}
		},node.dt * 1000);

		this.on('close', function(){
			if (node.fireResetInterval) {
				clearTimeout(node.fireResetInterval);
			}
			if (node.interval) {
				clearInterval(node.interval);
			}
		});

	}
	RED.nodes.registerType("PIDLoop", PIDLoop);	
}