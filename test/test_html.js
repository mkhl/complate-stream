/* global describe, it */
import { BufferedLogger } from "./util";
import generateHTML, { HTMLString } from "../src/html";
import BufferedStream from "../src/buffered-stream";
import { awaitAll, noop } from "../src/util";
import assert from "assert";

let h = generateHTML;

describe("HTML rendering", _ => {
	it("should generate a render function for streaming HTML elements", done => {
		let stream = new BufferedStream();
		let el = generateHTML("body");
		el(stream, { nonBlocking: true }, _ => {
			let html = stream.read();

			assert.equal(html, "<body></body>");
			done();
		});
	});

	it("should correspond to the function signature prescribed by JSX", done => {
		let el = h("body", { class: "foo" }, "lorem ipsum",
				"dolor sit amet");

		render(el, html => {
			assert.equal(html, '<body class="foo">lorem ipsumdolor sit amet</body>');
			done();
		});
	});
});

describe("HTML elements", _ => {
	it("should support nested elements", done => {
		let el = h("foo", null,
				h("bar", null,
						h("baz", null, "lorem", "ipsum")));

		render(el, html => {
			assert.equal(html, "<foo><bar><baz>loremipsum</baz></bar></foo>");
			done();
		});
	});

	it("should support unknown elements", done => {
		let el = h("custom-element");

		render(el, html => {
			assert.equal(html, "<custom-element></custom-element>");
			done();
		});
	});

	it("should omit closing tag for void elements", done => {
		let el = h("input");

		render(el, html => {
			assert.equal(html, "<input>");
			done();
		});
	});

	it("should report invalid children for void elements", done => {
		let el = h("div", null,
				h("p", null,
						h("input", null,
								h("span", null, "lipsum"))));

		let logger = new BufferedLogger();
		render(el, logger.log, html => {
			assertLog(logger.all, [{
				type: "error",
				substr: "void elements must not have children"
			}]);

			assert.equal(html, "<div><p><input><span>lipsum</span></p></div>");

			done();
		});
	});

	it("should support both elements and strings/numbers as child elements", done => {
		let el = h("p", null,
				h("em", null, "hello"),
				"lorem ipsum",
				h("mark", null, "world"),
				123);

		render(el, html => {
			assert.equal(html, "<p><em>hello</em>lorem ipsum<mark>world</mark>123</p>");
			done();
		});
	});

	it("should ignore blank values for child elements", done => {
		let el = h("p", null, null, "hello", undefined, "world", false);

		render(el, html => {
			assert.equal(html, "<p>helloworld</p>");
			done();
		});
	});

	it("should support nested arrays for child elements", done => {
		let el = h("p", null, "foo", ["hello", ["…", "…"], "world"], "bar");

		render(el, html => {
			assert.equal(html, "<p>foohello……worldbar</p>");
			done();
		});
	});

	it("should support generated child elements", done => {
		let el = h("div", null,
				"lorem ipsum",
				["foo", "bar", "baz"].map(item => {
					return h("i", null, item);
				}),
				"dolor sit amet");

		render(el, html => {
			assert.equal(html,
					"<div>lorem ipsum<i>foo</i><i>bar</i><i>baz</i>dolor sit amet</div>");
			done();
		});
	});

	it("should support blocking deferred child elements", done => {
		let deferred = callback => {
			let el = h("em", null, "lipsum");
			callback(el);
		};
		let el = h("p", null, "foo", deferred, "bar");

		render(el, html => {
			assert.equal(html, "<p>foo<em>lipsum</em>bar</p>");
			done();
		});
	});

	it("should support non-blocking deferred child elements in async mode", done => {
		let deferred = callback => {
			setTimeout(_ => {
				let el = h("em", null, "lipsum");
				callback(el);
			}, 10);
		};
		let el = h("p", null, "foo", deferred, "bar");

		render(el, html => {
			assert.equal(html, "<p>foo<em>lipsum</em>bar</p>");
			done();
		});
	});

	it("should balk at non-blocking deferred child elements in sync mode", done => {
		let deferred = callback => {
			setTimeout(_ => {
				let el = h("em", null, "lipsum");
				callback(el);
			}, 10);
		};
		let el = h("p", null, "foo", deferred, "bar");

		let stream = new BufferedStream();
		let fn = _ => el(stream, { nonBlocking: false }, noop);
		assert.throws(fn, /invalid non-blocking operation/);
		done();
	});
});

describe("HTML attributes", _ => {
	it("should convert parameters to suitable attributes", done => {
		let el = h("input", {
			type: "text",
			id: 123,
			name: null,
			title: undefined,
			autofocus: true,
			disabled: false
		});

		render(el, html => {
			assert.equal(html, '<input type="text" id="123" autofocus>');
			done();
		});
	});

	it("should report invalid attribute names", done => {
		let names = [{}, "foo bar", 'foo"bar', "foo'bar", "foo/bar", "foo=bar"];

		let end = awaitAll(names.length, done);

		names.forEach(name => {
			let attribs = {};
			attribs[name] = "lipsum";
			let el = h("div", attribs);

			let logger = new BufferedLogger();
			render(el, logger.log, html => {
				assertLog(logger.all, [{
					type: "error",
					substr: "invalid HTML attribute name"
				}]);

				end();
			});
		});
	});

	it("should report invalid attribute values", done => {
		let values = [{}, [], new Date(), /.*/];

		let end = awaitAll(values.length, done);

		values.forEach(value => {
			let el = h("div", { title: value });
			let logger = new BufferedLogger();
			render(el, logger.log, html => {
				assertLog(logger.all, [{
					type: "error",
					/* eslint-disable indent */
					substr: ["invalid value for HTML attribute",
							"intend to use `div` as a macro?"]
					/* eslint-enable indent */
				}]);

				end();
			});
		});
	});

	it("should report duplicate IDs", done => {
		let el = h("div", { id: "foo" },
				h("span", { id: "foo" }));

		let logger = new BufferedLogger();
		render(el, logger.log, html => {
			assertLog(logger.all, [{
				type: "error",
				substr: "duplicate HTML element ID"
			}]);

			assert.equal(html, '<div id="foo"><span id="foo"></span></div>');

			done();
		});
	});
});

describe("HTML encoding", _ => {
	it("should encode attributes and contents", done => {
		let el = h("div", { title: 'foo& <i>"bar"</i> \'baz' },
				h("p", null, 'lorem& <em>"ipsum"</em> \'…'));

		render(el, html => {
			assert(html.includes("<div " +
					'title="foo&amp; &lt;i&gt;&quot;bar&quot;&lt;/i&gt; &#x27;baz">'));
			assert(html.includes('<p>lorem&amp; &lt;em&gt;"ipsum"&lt;/em&gt; \'…</p>'));
			done();
		});
	});

	it("should allow for raw HTML, cicrumventing content encoding", done => {
		let el = h("p", null, new HTMLString("foo <i>bar</i> baz"));

		render(el, html => {
			assert(html.includes("<p>foo <i>bar</i> baz</p>"));
			done();
		});
	});

	it("should support large numbers of child elements", done => {
		let range = Array.apply(null, Array(10000));
		let el = h("ul", null, range.map((_, i) => {
			return h("li", null, i);
		}));

		render(el, html => {
			assert(html.includes("<li>9999</li></ul>"));
			done();
		});
	});
});

function assertLog(actual, expected) {
	assert.equal(actual.length, expected.length);
	actual.forEach((msg, i) => {
		let { type, substr } = expected[i];
		if(!substr.pop) {
			substr = [substr];
		}

		assert.equal(msg.type, type, `unexpected log-entry type: ${msg.type}`);
		substr.forEach(str => {
			assert(msg.message.includes(str), `missing log entry: "${str}"`);
		});
	});
}

function render(element, log, callback) {
	if(callback === undefined) { // shift arguments
		callback = log;
		log = null;
	}

	let stream = new BufferedStream();
	element(stream, { nonBlocking: true, log }, _ => {
		let html = stream.read();
		callback(html);
	});
}
