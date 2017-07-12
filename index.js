var AABB = require('aabb3');
var enclosingVolume = AABB.enclosingVolume;
var enclosingAABB   = AABB.enclosingAABB;

function compare(aabbA, aabbB, aabbC) {
	// Returns true if the difference between the volume of aabb B and the volume of the aabb bounding aabbs A and B is smaller than
	// the volume difference between the volume of aabb C and the volume of the aabb bounding aabbs A and C
	// In other words: will putting A with B take fewer space than putting it with C?
	var diffB = enclosingVolume(aabbA, aabbB) - aabbB.volume;
	var diffC = enclosingVolume(aabbA, aabbC) - aabbC.volume;

	return (diffB < diffC);
}

function AABBTreeNode(aabb, container) {
	this.container = container;
	this.set(aabb);
}

AABBTreeNode.prototype.set = function (aabb) {
	this.aabb   = aabb;
	this.left   = null;
	this.right  = null;
	this.parent = null;

	this.nbUpdatesSinceOptimisation = 0;
};

AABBTreeNode.prototype.updateBounds = function (){
	if (this.left === null) { return this.aabb.updateBounds(); }
	this.aabb.enclose(this.left.aabb, this.right.aabb);
	return true;
};

AABBTreeNode.prototype.updateBoundsWithDiff = function (){
	if (this.left === null) { return 0; }
	var volumeBefore = this.aabb.volume;
	this.aabb.enclose(this.left.aabb, this.right.aabb);
	return this.aabb.volume - volumeBefore;
};

function AABBTree() {
	this.count = 0;
	this.root  = null;

	this.nodeGarbage = [];

	// Every tree update,
	// A heuristic can select a node to optimise
	this.nodeToOptimise = null;
}

AABBTree.prototype._bind = function (nodeA, nodeB) {
	var newParent;
	if (this.nodeGarbage.length > 0) {
		newParent = this.nodeGarbage.pop();
		newParent.aabb.enclose(nodeA.aabb, nodeB.aabb);
	} else {
		newParent = new AABBTreeNode(enclosingAABB(nodeA.aabb, nodeB.aabb), this);
	}

	var parent = nodeA.parent;
	if (parent === null) {
		this.root = newParent;
	} else {
		if (parent.left === nodeA) {
			parent.left = newParent;
		} else {
			parent.right = newParent;
		}
	}

	newParent.left  = nodeB;
	newParent.right = nodeA;
	newParent.parent = parent;

	nodeB.parent = newParent;
	nodeA.parent = newParent;

	if (parent !== null) {
		this._update(parent);
	}
};

AABBTree.prototype._update = function (node) {
	if (node.left === null) { node = node.parent; }
	var current = node;
	while (current !== null) {
		current.updateBounds();
		current = current.parent;
	}
};

AABBTree.prototype.add = function (aabb) {
	var node;
	if (this.nodeGarbage.length > 0) {
		node = this.nodeGarbage.pop();
		node.set(aabb);
	} else {
		node = new AABBTreeNode(aabb, this);
	}

	this._addNode(node);
	return node;
};

AABBTree.prototype._addNode = function (node) {
	var aabb = node.aabb;
	var bounds = aabb.bounds;
	if (bounds[0] > bounds[1]) {
		// Node not added to tree
		// TODO: add it to a list of aabbes pending to be added
		return;
	}

	node.container = this;
	this.count += 1;

	if (this.root === null) {
		this.root = node;
		return;
	}

	// Searching for position in the tree
	// The global strategy is to reduce to sum of the volume of all the nodes in the tree

	// Going down the tree
	// At each node it is heuristically tested whether it would be more efficient
	// to bind the node to the left branch or the right branch
	// The binding with the lowest evaluation is selected

	var selection = this.root;
	while (selection.left !== null) {
		var aabbL = selection.left.aabb;
		var aabbR = selection.right.aabb;
		var boundsL = aabbL.bounds;
		var boundsR = aabbR.bounds;

		var lx0 = Math.min(boundsL[0], bounds[0]);
		var lx1 = Math.max(boundsL[1], bounds[1]);
		var ly0 = Math.min(boundsL[2], bounds[2]);
		var ly1 = Math.max(boundsL[3], bounds[3]);
		var lz0 = Math.min(boundsL[4], bounds[4]);
		var lz1 = Math.max(boundsL[5], bounds[5]);

		var rx0 = Math.min(boundsR[0], bounds[0]);
		var rx1 = Math.max(boundsR[1], bounds[1]);
		var ry0 = Math.min(boundsR[2], bounds[2]);
		var ry1 = Math.max(boundsR[3], bounds[3]);
		var rz0 = Math.min(boundsR[4], bounds[4]);
		var rz1 = Math.max(boundsR[5], bounds[5]);


		// Overlap of left and right if merging with left
		var overlapL = 0;
		var ldx = Math.min(lx1, boundsR[1]) - Math.max(lx0, boundsR[0]);
		var ldy = Math.min(ly1, boundsR[3]) - Math.max(ly0, boundsR[2]);
		var ldz = Math.min(lz1, boundsR[5]) - Math.max(lz0, boundsR[4]);
		if (ldx > 0 && ldy > 0 && ldz > 0) {
			overlapL = ldx * ldy * ldz;
		}

		// Overlap of left and right if merging with right
		var overlapR = 0;
		var rdx = Math.min(rx1, boundsL[1]) - Math.max(rx0, boundsL[0]);
		var rdy = Math.min(ry1, boundsL[3]) - Math.max(ry0, boundsL[2]);
		var rdz = Math.min(rz1, boundsL[5]) - Math.max(rz0, boundsL[4]);
		if (rdx > 0 && rdy > 0 && rdz > 0) {
			overlapR = rdx * rdy * rdz;
		}

		if (overlapL > 0 || overlapR > 0) {
			if (overlapL < overlapR) {
				selection = selection.left;
			} else {
				selection = selection.right;
			}
		} else {
			// No overlap
			// Selecting smallest increased volume
			// var volumeL = enclosingVolume(aabb, aabbL) - aabbL.volume;
			// var volumeR = enclosingVolume(aabb, aabbR) - aabbR.volume;
			if (compare(aabb, aabbL, aabbR)) {
				selection = selection.left;
			} else {
				selection = selection.right;
			}
		}
	}

	this._bind(selection, node);
};

AABBTree.prototype.removeByReference = function (node) {
	// The node has to be a leaf
	if (node.container !== this) {
		return false;
	}
	node.container = null;
	this.count -= 1;

	// // Adding leaf to garbage
	// this.nodeGarbage.push(node);

	var parent = node.parent;
	if (parent === null) {
		this.root = null;
		return;
	}

	// Adding parent to garbage
	this.nodeGarbage.push(parent);

	var nodeB = (parent.left === node)? parent.right : parent.left;
	var parentParent = parent.parent;
	if (parentParent === null) {
		this.root = nodeB;
		nodeB.parent = null;
		return true;
	} else {
		if (parentParent.left === parent) {
			parentParent.left = nodeB;
		} else {
			parentParent.right = nodeB;
		}
		nodeB.parent = parentParent;
	}

	this._update(parentParent);
	this._localOptimAscent(parentParent);
	return true;
};

AABBTree.prototype.updateNodeBounds = function (node) {
	if (node.container === null) {
		this._addNode(node);
	}

	if (node.container === null) {
		this._addNode(node);
	} else {
		var bounds = node.aabb.bounds;
		if (bounds[0] > bounds[1]) {
			this.removeByReference(node);
			return;
		}
	}

	if (node.left === null) { node = node.parent; }

	while (node !== null) {
		node.updateBounds();
		node = node.parent;
	}
};

AABBTree.prototype.updateBounds = function () {
	if (this.root === null) { return; }
	this.nodeToOptimise = null;
	this._updateBounds(this.root);
	this.globalOptimisation();
};

AABBTree.prototype._updateBounds = function (node) {
	if (node.left === null) {
		// var boundsUpdated = node.updateBounds();
		var boundsUpdated = node.aabb.updateBounds();
		if (boundsUpdated) {
			node.nbUpdatesSinceOptimisation += 1;
			if (this.nodeToOptimise === null || node.nbUpdatesSinceOptimisation > this.nodeToOptimise.nbUpdatesSinceOptimisation) {
				this.nodeToOptimise = node;
			}
		}
		// if (boundsUpdated && node.parent) {
		// 	this._localOptimAscent(node.parent);
		// }
		return boundsUpdated;
	}

	var updateLeft  = this._updateBounds(node.left);
	var updateRight = this._updateBounds(node.right);
	if (updateLeft || updateRight) {
		node.updateBounds();
		return true;
	}

	return false;
};

AABBTree.prototype.forEach = function (processingFunction, params) {
	this._forEach(this.root, processingFunction, params, 0);
};

AABBTree.prototype._forEach = function (node, processingFunction, params, depth) {
	if (!node) { return; }

	this._forEach(node.left, processingFunction,  params, depth + 1);
	this._forEach(node.right, processingFunction, params, depth + 1);
	processingFunction(node.aabb, params, depth);
};

AABBTree.prototype.forEachLeaf = function (processingFunction, params) {
	this._forEachLeaf(this.root, processingFunction, params);
};

AABBTree.prototype._forEachLeaf = function (node, processingFunction, params) {
	if (!node) { return; }

	this._forEachLeaf(node.left, processingFunction,  params);
	this._forEachLeaf(node.right, processingFunction, params);
	if (node.left === null) { processingFunction(node.aabb, params); }
};

AABBTree.prototype.forEachParent = function (processingFunction, params) {
	this._forEachParent(this.root, processingFunction, params);
};

AABBTree.prototype._forEachParent = function (node, processingFunction, params) {
	if (node.left === null) { return; }
	processingFunction(node, params);

	// processingFunction(node, params);
	this._forEachParent(node.left,  processingFunction, params);
	this._forEachParent(node.right, processingFunction, params);
};

AABBTree.prototype.forEachAtDepth = function (depth, processingFunction, params) {
	if (!this.root || this.root.left === null) {
		return;
	}
	this._forEachAtDepth(this.root, 0, depth, processingFunction, params);
};

AABBTree.prototype._forEachAtDepth = function (node, currentDepth, depth, processingFunction, params) {
	currentDepth += 1;
	if (currentDepth === depth) {
		processingFunction(node, params);
		return;
	}
	
	if (node.left !== null) {
		this._forEachAtDepth(node.left, currentDepth, depth, processingFunction, params);
		this._forEachAtDepth(node.right, currentDepth, depth, processingFunction, params);
	}
};


AABBTree.prototype.getTotalBoundingVolume = function () {
	return this._getTotalBoundingVolume(this.root);
};

AABBTree.prototype._getTotalBoundingVolume = function (node) {
	if (node === null) { return 0; }
	return node.aabb.volume + this._getTotalBoundingVolume(node.left) + this._getTotalBoundingVolume(node.right);
};

AABBTree.prototype._evaluateBinding = function (aabb, candidate) {
	var evaluation = 0;
	while (candidate.left !== null) {
		var aabbL = candidate.left.aabb;
		var aabbR = candidate.right.aabb;

		var diffL = enclosingVolume(aabb, aabbL) - aabbL.volume;
		var diffR = enclosingVolume(aabb, aabbR) - aabbR.volume;

		if (diffL < diffR) {
			// Selecting left node for binding evaluation
			evaluation += diffL;
			// evaluation = diffL;
			candidate = candidate.left;
		} else {
			// Selecting right node for binding evaluation
			evaluation += diffR;
			// evaluation = diffR;
			candidate = candidate.right;
		}
	}

	return evaluation + candidate.aabb.volume;
	// return evaluation;
};

AABBTree.prototype._addNodeWithDiff = function (node) {
	node.container = this;
	this.count += 1;

	if (this.root === null) {
		this.root = node;
		return 0;
	}

	// Searching for position in the tree
	// The global strategy is to reduce to sum of the volume of all the nodes in the tree

	// Going down the tree
	// At each node it is heuristically tested whether it would be more efficient
	// to bind the node to the left branch or the right branch
	// The binding with the lowest evaluation is be selected
	var aabb = node.aabb;

	var selection = this.root;
	var selectionAABB = selection.aabb;
	var enclosureDiff = enclosingVolume(aabb, selectionAABB) - selectionAABB.volume;
	while (selection.left !== null) {

		// v1
		// var evalBindingLeft  = this._evaluateBinding(aabb, selection.left);
		// var evalBindingRight = this._evaluateBinding(aabb, selection.right);
		// if (evalBindingLeft < evalBindingRight) {
		// 	selection = selection.left;
		// } else {
		// 	selection = selection.right;
		// }

		// v2
		// if (compare(aabb, selection.left.aabb, selection.right.aabb)) {
		// 	selection = selection.left;
		// } else {
		// 	selection = selection.right;
		// }

		// v3
		// var aabbL = selection.left.aabb;
		// var aabbR = selection.right.aabb;

		// var diffL = enclosingVolume(aabb, aabbL);
		// var diffR = enclosingVolume(aabb, aabbR);
		// if (Math.min(diffL, diffR) > selection.aabb.volume) {
		// 	// Binding with current selection
		// 	// console.error('youhou!')
		// 	break;
		// }

		// if (diffL - aabbL.volume < diffR - aabbR.volume) {
		// 	selection = selection.left;
		// } else {
		// 	selection = selection.right;
		// }

		// v4
		var evalBindingLeft  = this._evaluateBinding(aabb, selection.left);
		var evalBindingRight = this._evaluateBinding(aabb, selection.right);
		var evalBindingCurrent = enclosingVolume(aabb, selection.aabb);
		if (evalBindingLeft >= evalBindingCurrent && evalBindingRight >= evalBindingCurrent) {
			// Binding with current selection
			break;
		}

		if (evalBindingLeft < evalBindingRight) {
			selection = selection.left;
		} else {
			selection = selection.right;
		}

		// Adding cost of binding to selection
		selectionAABB = selection.aabb;
		enclosureDiff += enclosingVolume(aabb, selectionAABB) - selectionAABB.volume;
	}
	enclosureDiff += selection.aabb.volume;

	this._bind(selection, node);
	return enclosureDiff;
};

AABBTree.prototype._updateWithDiff = function (node) {
	var enclosureDiff = 0;
	if (node.left === null) { node = node.parent; }

	var current = node;
	while (current !== null) {
		enclosureDiff += current.updateBoundsWithDiff();
		current = current.parent;
	}

	return enclosureDiff;
};

AABBTree.prototype._removeByReferenceWithDiff = function (node) {
	node.container = null;
	this.count -= 1;

	// // Adding leaf to garbage
	// this.nodeGarbage.push(node);

	var parent = node.parent;
	if (parent === null) {
		this.root = null;
		return 0;
	}

	// Adding parent to garbage
	this.nodeGarbage.push(parent);

	var nodeB = (parent.left === node)? parent.right : parent.left;
	var parentParent = parent.parent;
	if (parentParent === null) {
		this.root = nodeB;
		nodeB.parent = null;
		return 0;
	} else {
		if (parentParent.left === parent) {
			parentParent.left = nodeB;
		} else {
			parentParent.right = nodeB;
		}
		nodeB.parent = parentParent;
	}

	var enclosureDiff = this._updateWithDiff(parentParent) - parent.aabb.volume;
	return enclosureDiff;
};

AABBTree.prototype._globalOptimisation = function (node) {
	// This corresponds to a descent heuristic
	// Solution will be accepted only if strictly better

	// Saving sibling
	var parent = node.parent;
	var sibling = (node === parent.left) ? parent.right : parent.left;

	// Evaluation of repositioning node
	// Phase 1 - Evaluating enclosing surface difference when node is removed
	var enclosureDiffOld = this._removeByReferenceWithDiff(node);

	// Phase 2 - Evaluating enclosing surface difference when repositioning node
	var enclosureDiffNew = this._addNodeWithDiff(node);

	// Phase 3 - Determine whether to leave node at new position or to reposition it at old position
	if (enclosureDiffNew + enclosureDiffOld > 0) {
		// Enclosure is bigger with new configuration
		// Removing node
		this.removeByReference(node);

		// Reinserting node by rebinding it to former sibling
		this._bind(sibling, node);

		// Incrementing node count (it was decremented when calling removeByReference)
		node.container = this;
		this.count += 1;
		return false;
	}

	// Running local optimisation with node at new position
	return this._localOptimAscent(node.parent);
};

AABBTree.prototype.globalOptimisation = function () {
	if (this.count <= 4) { return; }

	if (this.nodeToOptimise !== null) {
		this._globalOptimisation(this.nodeToOptimise);
		this.nodeToOptimise.nbUpdatesSinceOptimisation = 0;
		this.nodeToOptimise = null;
	}

	var log = Math.log(this.count) / Math.log(2);
	// var nTries = 0.001 * this.count * log;
	var nTries = this.count * 0.005;

	for (var i = 0; i < nTries; i += 1) {
		// Heuristically selecting a node
		var selection = this.root;

		while (selection.left !== null) {
			var nodeLeft  = selection.left;
			var nodeRight = selection.right;

			// Computing probability to search left node
			// var leftProbability = nodeLeft.aabb.volume / (nodeLeft.aabb.volume + nodeRight.aabb.volume);
			var leftProbability = Math.pow(nodeLeft.aabb.volume / (nodeLeft.aabb.volume + nodeRight.aabb.volume), 0.2);

			// Selecting what node to search with respect to probability
			selection = (Math.random() < leftProbability)? nodeLeft : nodeRight;
		}

		if (Math.random() < 0.1) {
			// This corresponds to a greedy heuristic
			// Solution is accepted even if it yields a worse result

			// Removing selection
			this.removeByReference(selection);

			// Reinserting selection
			this._addNode(selection);
		} else {
			var optimised = this._globalOptimisation(selection);

			// If it succeeds, adding more tries
			if (optimised) {
				nTries += log * 0.3;

				if (nTries > 10 * log) {
					nTries = 10 * log;
					// debugger
				}
			}
		}
	}
};

AABBTree.prototype.recursiveCount = function (node) {
	if (node.left === null) { return 1; }
	return this.recursiveCount(node.left) + this.recursiveCount(node.right);
};

AABBTree.prototype._localOptimAscent = function (node) {
	var optimised = this._localOptim(node);

	var parent = node.parent;
	if (parent !== null) { optimised = optimised || this._localOptimAscent(parent); }
	return optimised;
};

AABBTree.prototype._localOptimDescent = function (node) {
	var optimised = false;

	var nodeLeft  = node.left;
	var nodeRight = node.right;
	if (nodeLeft.left  !== null) { optimised = optimised || this._localOptimDescent(nodeLeft); }
	if (nodeRight.left !== null) { optimised = optimised || this._localOptimDescent(nodeRight); }
	optimised = optimised || this._localOptim(node);
	return optimised;
};

AABBTree.prototype._localOptim = function (node) {
	var nodeLeft  = node.left;
	var nodeRight = node.right;
	
	// Local optim using a swapping strategy
	var aabbL,  aabbR;
	var aabbLL, aabbLR;
	var aabbRL, aabbRR;

	if ((nodeLeft.left !== null) && (nodeRight.left !== null)) {
		// Attempting to swap nodeLeft and nodeRight's children
		aabbLL = nodeLeft.left.aabb;
		aabbLR = nodeLeft.right.aabb;
		aabbRL = nodeRight.left.aabb;
		aabbRR = nodeRight.right.aabb;

		var volumeRL = nodeLeft.aabb.volume + nodeRight.aabb.volume;

		var volumeLLRL = enclosingVolume(aabbLL, aabbRL);
		var volumeLLRR = enclosingVolume(aabbLL, aabbRR);
		var volumeLRRL = enclosingVolume(aabbLR, aabbRL);
		var volumeLRRR = enclosingVolume(aabbLR, aabbRR);

		if ((volumeLLRL + volumeLRRR < volumeRL) || (volumeLLRR + volumeLRRL < volumeRL)) {
			var tmpNode;
			if (volumeLLRL + volumeLRRR < volumeLLRR + volumeLRRL) {
				// swapping LR with RL
				tmpNode = nodeLeft.right;
				nodeLeft.right = nodeRight.left;
				nodeRight.left = tmpNode;


				nodeLeft.right.parent = nodeLeft;
				nodeRight.left.parent = nodeRight;
			} else {
				// swapping LR with RR
				tmpNode = nodeLeft.right;
				nodeLeft.right  = nodeRight.right;
				nodeRight.right = tmpNode;

				nodeLeft.right.parent  = nodeLeft;
				nodeRight.right.parent = nodeRight;
			}

			this._update(nodeLeft);
			this._update(nodeRight);
			return true;
		}

		return false;
	}

	if (nodeRight.left !== null) {
		// nodeLeft is a leaf
		// Attempting to swap nodeLeft and nodeRight's children

		aabbL  = nodeLeft.aabb;
		aabbRL = nodeRight.left.aabb;
		aabbRR = nodeRight.right.aabb;

		var volumeR = nodeRight.aabb.volume;

		// Computing volume of nodeRight when swapping nodeLeft with either children
		var volumeLRL = enclosingVolume(aabbL, aabbRL);
		var volumeLRR = enclosingVolume(aabbL, aabbRR);

		if ((volumeLRL < volumeR) || (volumeLRR < volumeR)) {
			if (volumeLRL < volumeLRR) {
				// Swapping L with RR
				node.left = nodeRight.right;
				nodeRight.right = nodeLeft;
			} else {
				// Swapping L with RL
				node.left = nodeRight.left;
				nodeRight.left = nodeLeft;
			}
			node.left.parent = node;
			nodeLeft.parent = nodeRight;
			this._update(nodeRight);
			return true;
		}

		return false;
	}


	if (nodeLeft.left !== null) {
		// nodeRight is a leaf
		// Attempting to swap nodeRight and nodeLeft's children

		aabbR  = nodeRight.aabb;
		aabbLL = nodeLeft.left.aabb;
		aabbLR = nodeLeft.right.aabb;

		var volumeL = nodeLeft.aabb.volume;

		// Computing volume of nodeLeft when swapping nodeRight with either children
		var volumeRLL = enclosingVolume(aabbR, aabbLL);
		var volumeRLR = enclosingVolume(aabbR, aabbLR);

		if ((volumeRLL < volumeL) || (volumeRLR < volumeL)) {
			if (volumeRLL < volumeRLR) {
				// Swapping R with LR
				node.right = nodeLeft.right;
				nodeLeft.right = nodeRight;
			} else {
				// Swapping R with LL
				node.right = nodeLeft.left;
				nodeLeft.left = nodeRight;
			}
			node.right.parent = node;
			nodeRight.parent = nodeLeft;
			this._update(nodeLeft);
			return true;
		}

		return false;
	}

	return false;
};

AABBTree.prototype.testCollisions = function (onCollision) {
	if (this.root === null) { return; }
	if (this.root.left !== null) { this._testCollisionsInBranch(this.root, onCollision); }
};

AABBTree.prototype._testCollisionsInBranch = function (branch, onCollision) {
	this._testCollisionsBetweenBranches(branch.left, branch.right, onCollision);
	var branchLeft  = branch.left;
	var branchRight = branch.right;
	if (branchLeft.left  !== null) { this._testCollisionsInBranch(branchLeft,  onCollision); }
	if (branchRight.left !== null) { this._testCollisionsInBranch(branchRight, onCollision); }
};

AABBTree.prototype._testCollisionsBetweenBranches = function (branchA, branchB, onCollision) {
	var boundsA = branchA.aabb.bounds;
	var boundsB = branchB.aabb.bounds;

	// Testing overlap
	if ((boundsA[0] - boundsB[1]) * (boundsA[1] - boundsB[0]) > 0) {
		// No overlap in x
		return;
	}

	if ((boundsA[2] - boundsB[3]) * (boundsA[3] - boundsB[2]) > 0) {
		// No overlap in y
		return;
	}

	if ((boundsA[4] - boundsB[5]) * (boundsA[5] - boundsB[4]) > 0) {
		// No overlap in z
		return;
	}

	// aabbes overlap
	if (branchA.left === null) {
		if (branchB.left === null) {
			// collision between aabbes left and right
			onCollision(branchA.aabb, branchB.aabb);
		} else {
			// branchA is a leaf, branchB has children
			this._testCollisionsBetweenBranches(branchA, branchB.left,  onCollision);
			this._testCollisionsBetweenBranches(branchA, branchB.right, onCollision);
		}
	} else {
		if (branchB.left === null) {
			// branchA has children, branchB is a leaf
			this._testCollisionsBetweenBranches(branchA.left,  branchB, onCollision);
			this._testCollisionsBetweenBranches(branchA.right, branchB, onCollision);
		} else {
			// branchA and branchB both have children
			this._testCollisionsBetweenBranches(branchA.left,  branchB.left,  onCollision);
			this._testCollisionsBetweenBranches(branchA.left,  branchB.right, onCollision);
			this._testCollisionsBetweenBranches(branchA.right, branchB.left,  onCollision);
			this._testCollisionsBetweenBranches(branchA.right, branchB.right, onCollision);
		}
	}
};

AABBTree.prototype.forEachCollidingWithSegment = function (segment, onCollision) {
	if (this.root === null) { return; }
	this._forEachCollidingWithSegment(segment, this.root, onCollision);
};

AABBTree.prototype._forEachCollidingWithSegment = function (segment, node, onCollision) {
	var aabb = node.aabb;
	if (aabb.intersectsWithSegment(segment)) {
		// Segment overlaps with node's bounds
		if (node.left === null) {
			onCollision(segment, aabb);
		} else {
			// Testing collision with node's branches
			this._forEachCollidingWithSegment(segment, node.left,  onCollision);
			this._forEachCollidingWithSegment(segment, node.right, onCollision);
		}
	}
};

AABBTree.prototype.forEachCollidingWithRay = function (ray, onCollision) {
	if (this.root === null) { return; }
	this._forEachCollidingWithRay(ray, this.root, onCollision);
};

AABBTree.prototype._forEachCollidingWithRay = function (ray, node, onCollision) {
	var aabb = node.aabb;
	if (aabb.intersectsWithRay(ray)) {
		// Segment overlaps with node's bounds
		if (node.left === null) {
			onCollision(ray, aabb);
		} else {
			// Testing collision with node's branches
			this._forEachCollidingWithRay(ray, node.left,  onCollision);
			this._forEachCollidingWithRay(ray, node.right, onCollision);
		}
	}
};

AABBTree.prototype.forEachCollidingWithFrustum = function (frustum, onCollision) {
	if (this.root === null) { return; }
	this._forEachCollidingWithFrustum(frustum, this.root, onCollision);
};

AABBTree.prototype._forEachCollidingWithFrustum = function (frustum, node, onCollision) {
	var aabb = node.aabb;
	if (aabb.intersectsWithFrustum(frustum)) {
		// Segment overlaps with node's bounds
		if (node.left === null) {
			onCollision(frustum, aabb);
		} else {
			// Testing collision with node's branches
			this._forEachCollidingWithFrustum(frustum, node.left,  onCollision);
			this._forEachCollidingWithFrustum(frustum, node.right, onCollision);
		}
	}
};

// var nTests = 0;
// var nPos = 0;
// var cpt = 0;
AABBTree.prototype.forEachCollidingWithAABB = function (aabb, onCollision) {
	if (this.root === null) { return; }
// nTests = 0;
// nPos = 0;
	this._forEachCollidingWithAABB(aabb, this.root, onCollision);
// if (Math.random() < 0.1) console.error('nTests', nTests, nPos)
// if (cpt < 200) {
// 	console.error('nTests', nTests, nPos)
// 	cpt ++;
// }
};

AABBTree.prototype._forEachCollidingWithAABB = function (aabb, node, onCollision) {
	var aabb2 = node.aabb;
// nTests += 1;
	if (aabb2.intersectsWithAABB(aabb)) {
// nPos += 1;
		// Segment overlaps with node's bounds
		if (node.left === null) {
			if (aabb !== aabb2) {
				onCollision(aabb, aabb2);
			}
		} else {
			// Testing collision with node's branches
			this._forEachCollidingWithAABB(aabb, node.left,  onCollision);
			this._forEachCollidingWithAABB(aabb, node.right, onCollision);
		}
	}
};

AABBTree.prototype.debugCollisions = function (onCollision) {
	var nTests = this._debugCollisionsInBranches(this.root, onCollision);
	return nTests;
};

AABBTree.prototype._debugCollisionsInBranches = function (node, onCollision) {
	if (node.left === null) return 0;

	var nTests = 0;
	nTests += this._debugCollisionsBetweenBranches(node.left, node.right, onCollision);
	nTests += this._debugCollisionsInBranches(node.left,  onCollision);
	nTests += this._debugCollisionsInBranches(node.right, onCollision);
	return nTests;
};

AABBTree.prototype._debugCollisionsBetweenBranches = function (nodeA, nodeB, onCollision) {
	var boundsA = nodeA.aabb.bounds;
	var boundsB = nodeB.aabb.bounds;

	// Computing overlap bounds
	var x0 = Math.max(boundsA[0], boundsB[0]);
	var x1 = Math.min(boundsA[1], boundsB[1]);
	var y0 = Math.max(boundsA[2], boundsB[2]);
	var y1 = Math.min(boundsA[3], boundsB[3]);
	var z0 = Math.max(boundsA[4], boundsB[4]);
	var z1 = Math.min(boundsA[5], boundsB[5]);

	var nTests = 0;
	if (x0 < x1 && y0 < y1 && z0 < z1) {
		// aabbes overlap
		if (nodeA.left === null) {
			if (nodeB.left === null) {
				// collision between aabbes left and right
				onCollision(x0, x1, y0, y1, z0, z1);
			} else {
				// nodeA is a leaf, nodeB has children
				nTests += this._debugCollisionsBetweenBranches(nodeA, nodeB.left,  onCollision);
				nTests += this._debugCollisionsBetweenBranches(nodeA, nodeB.right, onCollision);
			}
		} else {
			if (nodeB.left === null) {
				// nodeA has children, nodeB is a leaf
				nTests += this._debugCollisionsBetweenBranches(nodeA.left,  nodeB, onCollision);
				nTests += this._debugCollisionsBetweenBranches(nodeA.right, nodeB, onCollision);
			} else {
				// nodeA and nodeB both have children
				nTests += this._debugCollisionsBetweenBranches(nodeA.left,  nodeB.left,  onCollision);
				nTests += this._debugCollisionsBetweenBranches(nodeA.left,  nodeB.right, onCollision);
				nTests += this._debugCollisionsBetweenBranches(nodeA.right, nodeB.left,  onCollision);
				nTests += this._debugCollisionsBetweenBranches(nodeA.right, nodeB.right, onCollision);
			}
		}
	}

	return nTests + 1;
};

AABBTree.prototype.getRoot = function () {
	return this.root;
};

AABBTree.prototype.getCount = function () {
	return this.count;
};

AABBTree.prototype.clear = function () {
	this.count = 0;
	this.root = null;
};

module.exports = AABBTree;
