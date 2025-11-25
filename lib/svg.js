import { assert, Point } from "/lib/base";

const svg = {};

// A normal-form SVG path string is a data string with the following properties:
//   - Every command in the path is in ['L', 'M', 'Q', 'Z'].
//   - Adjacent tokens in the path are separated by exactly one space.
//   - There is exactly one 'Z', and it is the last command.
//
// A segment is a section of a path, represented as an object that has a start,
// an end, and possibly a control, all of which are valid Points (that is, pairs
// of Numbers).
//
// A path is a list of segments which is non-empty and closed - that is, the end
// of the last segment on the path is the start of the first.

// Returns twice the area contained in the polygon. The result is positive iff
// the polygon winds in the counter-clockwise direction.
const get2xArea = (polygon) => {
	let area = 0;
	for (var i = 0; i < polygon.length; i++) {
		const p1 = polygon[i];
		const p2 = polygon[(i + 1) % polygon.length];
		area += (p2[0] + p1[0]) * (p2[1] - p1[1]);
	}
	return area;
};

// Takes a list of paths and orients them so that exterior contours are oriented
// counter-clockwise and interior contours clockwise.
const orientPaths = (paths, approximation_error) => {
	const polygons = paths.map(svg.getPolygonApproximation);
	for (var i = 0; i < paths.length; i++) {
		const path = paths[i];
		let contains = 0;
		for (let j = 0; j < paths.length; j++) {
			if (j === i) {
				continue;
			} else if (svg.polygonContainsPoint(polygons[j], path[0].start)) {
				contains += 1;
			}
		}
		const area = get2xArea(polygons[i]);
		// The path is an external path iff it is contained in an even number of
		// other paths. It is counter-clockwise iff its area is positive. The path
		// should be reversed if (CCW && internal) || (CW && external).
		const should_reverse = area > 0 !== (contains % 2 === 0);
		if (should_reverse) {
			for (let segment of path) {
				[segment.start, segment.end] = [segment.end, segment.start];
			}
			path.reverse();
		}
	}
	return paths;
};

// Takes a normal-form SVG path string and converts it to a list of paths.
const splitPath = (path) => {
	assert(path.length > 0);
	assert(path[0] === "M", `Path did not start with M: ${path}`);
	assert(path[path.length - 1] === "Z", `Path did not end with Z: ${path}`);
	const terms = path.split(" ");
	const result = [];
	let start = undefined;
	let current = undefined;
	for (let i = 0; i < terms.length; i++) {
		const command = terms[i];
		assert(command.length > 0, `Path includes empty command: ${path}`);
		assert("LMQZ".indexOf(command) >= 0, command);
		if (command === "M" || command === "Z") {
			if (current !== undefined) {
				assert(Point.equal(current, start), `Path has open contour: ${path}`);
				assert(result[result.length - 1].length > 0, `Path has empty contour: ${path}`);
				if (command === "Z") {
					assert(i === terms.length - 1, `Path ended early: ${path}`);
					return result;
				}
			}
			result.push([]);
			assert(i < terms.length - 2, `Missing point on path: ${path}`);
			start = [parseFloat(terms[i + 1], 10), parseFloat(terms[i + 2], 10)];
			assert(Point.valid(start));
			i += 2;
			current = Point.clone(start);
			continue;
		}
		let control = undefined;
		if (command === "Q") {
			assert(i < terms.length - 2, `Missing point on path: ${path}`);
			control = [parseFloat(terms[i + 1], 10), parseFloat(terms[i + 2], 10)];
			assert(Point.valid(control));
			i += 2;
		}
		assert(i < terms.length - 2, `Missing point on path: ${path}`);
		const end = [parseFloat(terms[i + 1], 10), parseFloat(terms[i + 2], 10)];
		assert(Point.valid(end));
		i += 2;
		if (Point.equal(current, end)) {
			continue;
		}
		if (control !== undefined && (Point.equal(control, current) || Point.equal(control, end))) {
			control = undefined;
		}
		result[result.length - 1].push({
			start: Point.clone(current),
			control: control,
			end: end,
		});
		current = Point.clone(end);
	}
};

// Takes a TrueType font command list (as provided by opentype.js) and returns
// a normal-form SVG path string as defined above.
svg.convertCommandsToPath = (commands) => {
	const terms = [];

	let lastX = 0,
		lastY = 0;
	let startX = 0,
		startY = 0;

	for (let i = 0; i < commands.length; i++) {
		const command = commands[i];

		// Handle M (move) command - marks the start of a contour
		if (command.type === "M") {
			terms.push("M", command.x, command.y);
			lastX = command.x;
			lastY = command.y;
			startX = command.x;
			startY = command.y;
			continue;
		}

		// Handle cubic Bezier curves by converting to multiple quadratic curves
		// Uses adaptive subdivision based on curve complexity for high accuracy
		if (command.type === "C") {
			const p0x = lastX;
			const p0y = lastY;
			const c1x = command.x1;
			const c1y = command.y1;
			const c2x = command.x2;
			const c2y = command.y2;
			const p1x = command.x;
			const p1y = command.y;

			// More sophisticated complexity measurement
			const chordLength = Math.sqrt((p1x - p0x) * (p1x - p0x) + (p1y - p0y) * (p1y - p0y));
			const polyLength =
				Math.sqrt((c1x - p0x) * (c1x - p0x) + (c1y - p0y) * (c1y - p0y)) +
				Math.sqrt((c2x - c1x) * (c2x - c1x) + (c2y - c1y) * (c2y - c1y)) +
				Math.sqrt((p1x - c2x) * (p1x - c2x) + (p1y - c2y) * (p1y - c2y));

			// Check for sharp turns by examining angles between segments
			const v1x = c1x - p0x,
				v1y = c1y - p0y;
			const v2x = c2x - c1x,
				v2y = c2y - c1y;
			const v3x = p1x - c2x,
				v3y = p1y - c2y;

			// Dot products to detect sharp angles
			const len1 = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
			const len2 = Math.sqrt(v2x * v2x + v2y * v2y) || 1;
			const len3 = Math.sqrt(v3x * v3x + v3y * v3y) || 1;

			const dot1 = (v1x * v2x + v1y * v2y) / (len1 * len2);
			const dot2 = (v2x * v3x + v2y * v3y) / (len2 * len3);

			const hasSharpTurn = dot1 < 0.5 || dot2 < 0.5; // Angle > 60 degrees

			const complexity = polyLength / (chordLength + 1);

			// More aggressive subdivision strategy
			let numSegments = 3; // Default: 3 segments for better quality

			if (complexity < 1.15) {
				numSegments = 2; // Relatively simple curve
			} else if (hasSharpTurn || complexity > 2.5) {
				numSegments = 6; // Very complex or sharp curve - use 6 segments
			} else if (complexity > 1.8) {
				numSegments = 5; // Complex curve
			} else if (complexity > 1.4) {
				numSegments = 4; // Moderately complex
			}

			// Subdivide the cubic curve into numSegments quadratic curves
			for (let seg = 0; seg < numSegments; seg++) {
				const t1 = seg / numSegments;
				const t2 = (seg + 1) / numSegments;
				const tMid = (t1 + t2) / 2;

				// Evaluate cubic Bezier at t1, tMid, t2 using proper formula
				const getPoint = (t) => {
					const mt = 1 - t;
					const mt2 = mt * mt;
					const mt3 = mt2 * mt;
					const t2sq = t * t;
					const t3 = t2sq * t;

					return {
						x: mt3 * p0x + 3 * mt2 * t * c1x + 3 * mt * t2sq * c2x + t3 * p1x,
						y: mt3 * p0y + 3 * mt2 * t * c1y + 3 * mt * t2sq * c2y + t3 * p1y,
					};
				};

				const start = seg === 0 ? { x: p0x, y: p0y } : getPoint(t1);
				const mid = getPoint(tMid);
				const end = getPoint(t2);

				// Calculate quadratic control point from three points
				// For a quadratic passing through start, mid, end:
				// control = 2*mid - 0.5*(start + end)
				const qx = 2 * mid.x - 0.5 * (start.x + end.x);
				const qy = 2 * mid.y - 0.5 * (start.y + end.y);

				terms.push("Q", qx, qy, end.x, end.y);
			}

			lastX = p1x;
			lastY = p1y;
			continue;
		}

		// Handle Z (close path) - can appear multiple times for multi-contour glyphs
		if (command.type === "Z") {
			// If the path doesn't end exactly at the start, add a line to close it
			const epsilon = 0.01; // Small tolerance for floating point comparison
			if (Math.abs(lastX - startX) > epsilon || Math.abs(lastY - startY) > epsilon) {
				terms.push("L", startX, startY);
				lastX = startX;
				lastY = startY;
			}
			continue;
		}

		// Validate command type exists and is supported
		if (!command.type) {
			throw new Error("Command type is undefined at index " + i + ": " + JSON.stringify(command));
		}
		if ("LQ".indexOf(command.type) < 0) {
			throw new Error('Unsupported command type "' + command.type + '" at index ' + i);
		}

		terms.push(command.type);
		assert((command.x1 !== undefined) === (command.type === "Q"));
		if (command.x1 !== undefined) {
			terms.push(command.x1);
			terms.push(command.y1);
		}
		assert(command.x !== undefined);
		terms.push(command.x);
		terms.push(command.y);

		// Update last position
		lastX = command.x;
		lastY = command.y;
	}

	// Ensure we have at least a move command
	if (terms.length === 0 || terms[0] !== "M") {
		throw new Error("Path has no move command. Commands were: " + JSON.stringify(commands.slice(0, 5)));
	}

	// Ensure the final path closes properly
	const epsilon = 0.01;
	if (Math.abs(lastX - startX) > epsilon || Math.abs(lastY - startY) > epsilon) {
		terms.push("L", startX, startY);
	}

	terms.push("Z");
	return terms.join(" ");
};

// Converts a normal-form SVG path string to a list of paths. The paths obey an
// orientation constraint: the external paths are oriented counter-clockwise,
// while the internal paths are oriented clockwise.
svg.convertSVGPathToPaths = (path) => {
	return orientPaths(splitPath(path));
};

// Takes the given list of paths and returns a normal-form SVG path string.
svg.convertPathsToSVGPath = (paths) => {
	const terms = [];
	for (let path of paths) {
		assert(path.length > 0);
		terms.push("M");
		terms.push(path[0].start[0]);
		terms.push(path[0].start[1]);
		for (let segment of path) {
			if (segment.control === undefined) {
				terms.push("L");
			} else {
				terms.push("Q");
				terms.push(segment.control[0]);
				terms.push(segment.control[1]);
			}
			terms.push(segment.end[0]);
			terms.push(segment.end[1]);
		}
	}
	terms.push("Z");
	return terms.join(" ");
};

// Takes a path (a list of segments) and returns a polygon approximation to it.
// The polygon is given as a list of pairs of points.
//
// The approximation error is an upper-bound on the distance between consecutive
// points in the polygon approximation used to compute the area. The default
// error of 64 is chosen because the glyphs have a total size of 1024x1024.
svg.getPolygonApproximation = (path, approximation_error) => {
	const result = [];
	approximation_error = approximation_error || 64;
	for (let x of path) {
		const control = x.control || Point.midpoint(x.start, x.end);
		const distance = Math.sqrt(Point.distance2(x.start, x.end));
		const num_points = Math.floor(distance / approximation_error);
		for (let i = 0; i < num_points; i++) {
			const t = (i + 1) / (num_points + 1);
			const s = 1 - t;
			result.push([
				s * s * x.start[0] + 2 * s * t * control[0] + t * t * x.end[0],
				s * s * x.start[1] + 2 * s * t * control[1] + t * t * x.end[1],
			]);
		}
		result.push(x.end);
	}
	return result;
};

// Returns true if the given point is contained inside the given polygon.
svg.polygonContainsPoint = (polygon, point) => {
	const x = point[0];
	const y = point[1];
	let crossings = 0;
	for (let i = 0; i < polygon.length; i++) {
		const segment = { start: polygon[i], end: polygon[(i + 1) % polygon.length] };
		if ((segment.start[0] < x && x < segment.end[0]) || (segment.start[0] > x && x > segment.end[0])) {
			const t = (x - segment.end[0]) / (segment.start[0] - segment.end[0]);
			const cy = t * segment.start[1] + (1 - t) * segment.end[1];
			if (y > cy) {
				crossings += 1;
			}
		} else if (segment.start[0] === x && segment.start[1] <= y) {
			if (segment.end[0] > x) {
				crossings += 1;
			}
			const last = polygon[(i + polygon.length - 1) % polygon.length];
			if (last[0] > x) {
				crossings += 1;
			}
		}
	}
	return crossings % 2 === 1;
};

export { svg };
