import generateHTML from "./html";
import { flatCompact, noop } from "./util";

const TAG_MACROS = {};

export default function documentRenderer(doctype = "<!DOCTYPE html>") {
	return (stream, tag, params, callback) => {
		if(doctype) {
			stream.writeln(doctype);
		}
		let element = createElement(tag, params);

		if(callback) { // non-blocking mode
			element(stream, true, callback);
		} else { // blocking mode
			element(stream, false, noop);
		}
	};
}

export function registerMacro(tag, fn) { // TODO: rename?
	if(TAG_MACROS[tag]) {
		throw new Error(`invalid tag macro: <${tag}> already registered`);
	}

	TAG_MACROS[tag] = fn;
}

export function createElement(tag, params, ...children) {
	let macro = TAG_MACROS[tag];
	/* eslint-disable indent */
	return macro ? macro(params, ...flatCompact(children)) :
			generateHTML(tag, params, ...children);
	/* eslint-enable indent */
}
