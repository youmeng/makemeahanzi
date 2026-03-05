import simplify from "/lib/external/simplify/1.2.2/simplify";

import { assert, Point } from "/lib/base";
import { svg } from "/lib/svg";

const size = 1024;
const rise = 900;
const num_to_match = 8;

let voronoi = undefined;

const filterMedian = (median, n) => {
	const distances = _.range(median.length - 1).map((i) => Math.sqrt(Point.distance2(median[i], median[i + 1])));
	let total = 0;
	distances.map((x) => (total += x));
	const result = [];
	let index = 0;
	let position = median[0];
	let total_so_far = 0;
	for (let i of _.range(n - 1)) {
		const target = (i * total) / (n - 1);
		while (total_so_far < target) {
			const step = Math.sqrt(Point.distance2(position, median[index + 1]));
			if (total_so_far + step < target) {
				index += 1;
				position = median[index];
				total_so_far += step;
			} else {
				const t = (target - total_so_far) / step;
				position = [(1 - t) * position[0] + t * median[index + 1][0], (1 - t) * position[1] + t * median[index + 1][1]];
				total_so_far = target;
			}
		}
		result.push(Point.clone(position));
	}
	result.push(median[median.length - 1]);
	return result;
};

const findLongestShortestPath = (adjacency, vertices, node) => {
	const path = findPathFromFurthestNode(adjacency, vertices, node);
	return findPathFromFurthestNode(adjacency, vertices, path[0]);
};

const findPathFromFurthestNode = (adjacency, vertices, node, visited) => {
	visited = visited || {};
	visited[node] = true;
	let result = [];
	result.distance = 0;
	for (let neighbor of adjacency[node] || []) {
		if (!visited[neighbor]) {
			const candidate = findPathFromFurthestNode(adjacency, vertices, neighbor, visited);
			candidate.distance += Math.sqrt(Point.distance2(vertices[node], vertices[neighbor]));
			if (candidate.distance > result.distance) {
				result = candidate;
			}
		}
	}
	result.push(node);
	return result;
};

// BFS to find the path between two specific nodes in the skeleton graph.
const findPathBetweenNodes = (adjacency, start, end) => {
	const prev = { [start]: -1 };
	const queue = [start];
	for (let qi = 0; qi < queue.length; qi++) {
		const node = queue[qi];
		if (node === end) {
			const path = [];
			let cur = end;
			while (cur !== -1) {
				path.unshift(cur);
				cur = prev[cur];
			}
			return path;
		}
		for (const neighbor of adjacency[node] || []) {
			if (!(neighbor in prev)) {
				prev[neighbor] = node;
				queue.push(neighbor);
			}
		}
	}
	return null;
};

const findStrokeMedian = (stroke) => {
	const paths = svg.convertSVGPathToPaths(stroke);
	assert(paths.length === 1, `Got stroke with multiple loops: ${stroke}`);

	let polygon = undefined;
	let diagram = undefined;
	for (let approximation of [16, 64]) {
		polygon = svg.getPolygonApproximation(paths[0], approximation);
		voronoi = voronoi || new Voronoi();
		const sites = polygon.map((point) => ({ x: point[0], y: point[1] }));
		const bounding_box = { xl: -size, xr: size, yt: -size, yb: size };
		try {
			diagram = voronoi.compute(sites, bounding_box);
			break;
		} catch (error) {
			console.error(`WARNING: Voronoi computation failed at ${approximation}.`);
		}
	}
	assert(diagram, "Voronoi computation failed completely!");

	diagram.vertices.map((x, i) => {
		x.include = svg.polygonContainsPoint(polygon, [x.x, x.y]);
		x.index = i;
	});
	const vertices = diagram.vertices.map((x) => [x.x, x.y].map(Math.round));
	const edges = diagram.edges
		.map((x) => [x.va.index, x.vb.index])
		.filter((x) => diagram.vertices[x[0]].include && diagram.vertices[x[1]].include);
	voronoi.recycle(diagram);

	assert(edges.length > 0);
	const adjacency = {};
	for (let edge of edges) {
		adjacency[edge[0]] = adjacency[edge[0]] || [];
		adjacency[edge[0]].push(edge[1]);
		adjacency[edge[1]] = adjacency[edge[1]] || [];
		adjacency[edge[1]].push(edge[0]);
	}
	const root = edges[0][0];
	let path = findLongestShortestPath(adjacency, vertices, root);

	// Some fonts have strokes whose ink extends above the character box (y < 0
	// in SVG coordinates). This creates a longer Voronoi skeleton branch in the
	// out-of-bounds region, causing findLongestShortestPath to pick the wrong
	// endpoint (e.g. the 讠-type 横折提 ends pointing downward instead of toward
	// the 提 tip). Detect this and re-route to the longest path between two
	// in-bounds (y >= 0) leaf nodes instead.
	const natural_end = path[path.length - 1];
	const natural_start = path[0];
	const allLeaves = Object.keys(adjacency)
		.filter((k) => adjacency[k].length === 1)
		.map(Number);

	// If either endpoint is extremely near or below the baseline (y < 20), it is
	// a Voronoi artifact from ink that dips to/below the baseline in this font
	// (e.g. 讠-type 横折提). The natural path only covers one arm of the Y-junction
	// (anchor→fold-bottom), missing the 提-tip arm entirely. Build the full
	// U-path: anchor → fold-bottom → 提-tip.
	const artifact_threshold = 20;
	const tip_threshold = rise * 0.1; // 90 — minimum y for a valid 提-tip leaf
	if (vertices[natural_end][1] < artifact_threshold || vertices[natural_start][1] < artifact_threshold) {
		// fold = the near-baseline endpoint (artifact); anchor = the other end.
		const fold = vertices[natural_start][1] < artifact_threshold ? natural_start : natural_end;
		const anchor_node = fold === natural_start ? natural_end : natural_start;

		// Find best 提-tip leaf: in-bounds (y >= tip_threshold), not fold, not anchor.
		// Pick the rightmost (largest x) — the 提 tip always extends to the right.
		const tipLeaves = allLeaves.filter((n) => n !== anchor_node && n !== fold && vertices[n][1] >= tip_threshold);
		let best_leaf = null;
		let best_x = -Infinity;
		for (const leaf of tipLeaves) {
			if (vertices[leaf][0] > best_x) {
				best_x = vertices[leaf][0];
				best_leaf = leaf;
			}
		}

		if (best_leaf !== null) {
			// Full U-path: anchor → fold (natural path) + fold → tip (BFS)
			// path[] runs natural_start→natural_end; reverse if needed so it starts at anchor.
			const anchor_to_fold = fold === natural_start ? path.slice().reverse() : path.slice();
			const fold_to_tip = findPathBetweenNodes(adjacency, fold, best_leaf);
			path = anchor_to_fold.concat(fold_to_tip.slice(1));
		}
	}

	const points = path.map((i) => vertices[i]);

	const tolerance = 4;
	const simple = simplify(
		points.map((x) => ({ x: x[0], y: x[1] })),
		tolerance,
	);
	return simple.map((x) => [x.x, x.y]);
};

const normalizeForMatch = (median) => {
	return filterMedian(median, num_to_match).map((x) => [x[0] / size, (rise - x[1]) / size]);
};

const median_util = {
	findStrokeMedian: findStrokeMedian,
	normalizeForMatch: normalizeForMatch,
};

export { median_util };
