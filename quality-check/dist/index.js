/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 181:
/***/ ((module) => {

module.exports = require("buffer");

/***/ }),

/***/ 932:
/***/ ((module) => {

module.exports = require("process");

/***/ }),

/***/ 2576:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var Scalar = __nccwpck_require__(8732);
var YAMLMap = __nccwpck_require__(2613);
var YAMLSeq = __nccwpck_require__(3584);
var resolveBlockMap = __nccwpck_require__(6448);
var resolveBlockSeq = __nccwpck_require__(5397);
var resolveFlowCollection = __nccwpck_require__(737);

function resolveCollection(CN, ctx, token, onError, tagName, tag) {
    const coll = token.type === 'block-map'
        ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag)
        : token.type === 'block-seq'
            ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag)
            : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
    const Coll = coll.constructor;
    // If we got a tagName matching the class, or the tag name is '!',
    // then use the tagName from the node class used to create it.
    if (tagName === '!' || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
    }
    if (tagName)
        coll.tag = tagName;
    return coll;
}
function composeCollection(CN, ctx, token, props, onError) {
    const tagToken = props.tag;
    const tagName = !tagToken
        ? null
        : ctx.directives.tagName(tagToken.source, msg => onError(tagToken, 'TAG_RESOLVE_FAILED', msg));
    if (token.type === 'block-seq') {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken
            ? anchor.offset > tagToken.offset
                ? anchor
                : tagToken
            : (anchor ?? tagToken);
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
            const message = 'Missing newline after block sequence props';
            onError(lastProp, 'MISSING_CHAR', message);
        }
    }
    const expType = token.type === 'block-map'
        ? 'map'
        : token.type === 'block-seq'
            ? 'seq'
            : token.start.source === '{'
                ? 'map'
                : 'seq';
    // shortcut: check if it's a generic YAMLMap or YAMLSeq
    // before jumping into the custom tag logic.
    if (!tagToken ||
        !tagName ||
        tagName === '!' ||
        (tagName === YAMLMap.YAMLMap.tagName && expType === 'map') ||
        (tagName === YAMLSeq.YAMLSeq.tagName && expType === 'seq')) {
        return resolveCollection(CN, ctx, token, onError, tagName);
    }
    let tag = ctx.schema.tags.find(t => t.tag === tagName && t.collection === expType);
    if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
            ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
            tag = kt;
        }
        else {
            if (kt) {
                onError(tagToken, 'BAD_COLLECTION_TYPE', `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? 'scalar'}`, true);
            }
            else {
                onError(tagToken, 'TAG_RESOLVE_FAILED', `Unresolved tag: ${tagName}`, true);
            }
            return resolveCollection(CN, ctx, token, onError, tagName);
        }
    }
    const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
    const res = tag.resolve?.(coll, msg => onError(tagToken, 'TAG_RESOLVE_FAILED', msg), ctx.options) ?? coll;
    const node = identity.isNode(res)
        ? res
        : new Scalar.Scalar(res);
    node.range = coll.range;
    node.tag = tagName;
    if (tag?.format)
        node.format = tag.format;
    return node;
}

exports.composeCollection = composeCollection;


/***/ }),

/***/ 4324:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Document = __nccwpck_require__(5244);
var composeNode = __nccwpck_require__(128);
var resolveEnd = __nccwpck_require__(7919);
var resolveProps = __nccwpck_require__(7940);

function composeDoc(options, directives, { offset, start, value, end }, onError) {
    const opts = Object.assign({ _directives: directives }, options);
    const doc = new Document.Document(undefined, opts);
    const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
    };
    const props = resolveProps.resolveProps(start, {
        indicator: 'doc-start',
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
    });
    if (props.found) {
        doc.directives.docStart = true;
        if (value &&
            (value.type === 'block-map' || value.type === 'block-seq') &&
            !props.hasNewline)
            onError(props.end, 'MISSING_CHAR', 'Block collection cannot start on same line with directives-end marker');
    }
    // @ts-expect-error If Contents is set, let's trust the user
    doc.contents = value
        ? composeNode.composeNode(ctx, value, props, onError)
        : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
    const contentEnd = doc.contents.range[2];
    const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
    if (re.comment)
        doc.comment = re.comment;
    doc.range = [offset, contentEnd, re.offset];
    return doc;
}

exports.composeDoc = composeDoc;


/***/ }),

/***/ 128:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Alias = __nccwpck_require__(7798);
var identity = __nccwpck_require__(3662);
var composeCollection = __nccwpck_require__(2576);
var composeScalar = __nccwpck_require__(7964);
var resolveEnd = __nccwpck_require__(7919);
var utilEmptyScalarPosition = __nccwpck_require__(382);

const CN = { composeNode, composeEmptyNode };
function composeNode(ctx, token, props, onError) {
    const atKey = ctx.atKey;
    const { spaceBefore, comment, anchor, tag } = props;
    let node;
    let isSrcToken = true;
    switch (token.type) {
        case 'alias':
            node = composeAlias(ctx, token, onError);
            if (anchor || tag)
                onError(token, 'ALIAS_PROPS', 'An alias node must not specify any properties');
            break;
        case 'scalar':
        case 'single-quoted-scalar':
        case 'double-quoted-scalar':
        case 'block-scalar':
            node = composeScalar.composeScalar(ctx, token, tag, onError);
            if (anchor)
                node.anchor = anchor.source.substring(1);
            break;
        case 'block-map':
        case 'block-seq':
        case 'flow-collection':
            try {
                node = composeCollection.composeCollection(CN, ctx, token, props, onError);
                if (anchor)
                    node.anchor = anchor.source.substring(1);
            }
            catch (error) {
                // Almost certainly here due to a stack overflow
                const message = error instanceof Error ? error.message : String(error);
                onError(token, 'RESOURCE_EXHAUSTION', message);
            }
            break;
        default: {
            const message = token.type === 'error'
                ? token.message
                : `Unsupported token (type: ${token.type})`;
            onError(token, 'UNEXPECTED_TOKEN', message);
            isSrcToken = false;
        }
    }
    node ?? (node = composeEmptyNode(ctx, token.offset, undefined, null, props, onError));
    if (anchor && node.anchor === '')
        onError(anchor, 'BAD_ALIAS', 'Anchor cannot be an empty string');
    if (atKey &&
        ctx.options.stringKeys &&
        (!identity.isScalar(node) ||
            typeof node.value !== 'string' ||
            (node.tag && node.tag !== 'tag:yaml.org,2002:str'))) {
        const msg = 'With stringKeys, all keys must be strings';
        onError(tag ?? token, 'NON_STRING_KEY', msg);
    }
    if (spaceBefore)
        node.spaceBefore = true;
    if (comment) {
        if (token.type === 'scalar' && token.source === '')
            node.comment = comment;
        else
            node.commentBefore = comment;
    }
    // @ts-expect-error Type checking misses meaning of isSrcToken
    if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
    return node;
}
function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
    const token = {
        type: 'scalar',
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ''
    };
    const node = composeScalar.composeScalar(ctx, token, tag, onError);
    if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === '')
            onError(anchor, 'BAD_ALIAS', 'Anchor cannot be an empty string');
    }
    if (spaceBefore)
        node.spaceBefore = true;
    if (comment) {
        node.comment = comment;
        node.range[2] = end;
    }
    return node;
}
function composeAlias({ options }, { offset, source, end }, onError) {
    const alias = new Alias.Alias(source.substring(1));
    if (alias.source === '')
        onError(offset, 'BAD_ALIAS', 'Alias cannot be an empty string');
    if (alias.source.endsWith(':'))
        onError(offset + source.length - 1, 'BAD_ALIAS', 'Alias ending in : is ambiguous', true);
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
    alias.range = [offset, valueEnd, re.offset];
    if (re.comment)
        alias.comment = re.comment;
    return alias;
}

exports.composeEmptyNode = composeEmptyNode;
exports.composeNode = composeNode;


/***/ }),

/***/ 7964:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var Scalar = __nccwpck_require__(8732);
var resolveBlockScalar = __nccwpck_require__(1788);
var resolveFlowScalar = __nccwpck_require__(4513);

function composeScalar(ctx, token, tagToken, onError) {
    const { value, type, comment, range } = token.type === 'block-scalar'
        ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError)
        : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
    const tagName = tagToken
        ? ctx.directives.tagName(tagToken.source, msg => onError(tagToken, 'TAG_RESOLVE_FAILED', msg))
        : null;
    let tag;
    if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
    }
    else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
    else if (token.type === 'scalar')
        tag = findScalarTagByTest(ctx, value, token, onError);
    else
        tag = ctx.schema[identity.SCALAR];
    let scalar;
    try {
        const res = tag.resolve(value, msg => onError(tagToken ?? token, 'TAG_RESOLVE_FAILED', msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, 'TAG_RESOLVE_FAILED', msg);
        scalar = new Scalar.Scalar(value);
    }
    scalar.range = range;
    scalar.source = value;
    if (type)
        scalar.type = type;
    if (tagName)
        scalar.tag = tagName;
    if (tag.format)
        scalar.format = tag.format;
    if (comment)
        scalar.comment = comment;
    return scalar;
}
function findScalarTagByName(schema, value, tagName, tagToken, onError) {
    if (tagName === '!')
        return schema[identity.SCALAR]; // non-specific tag
    const matchWithTest = [];
    for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
            if (tag.default && tag.test)
                matchWithTest.push(tag);
            else
                return tag;
        }
    }
    for (const tag of matchWithTest)
        if (tag.test?.test(value))
            return tag;
    const kt = schema.knownTags[tagName];
    if (kt && !kt.collection) {
        // Ensure that the known tag is available for stringifying,
        // but does not get used by default.
        schema.tags.push(Object.assign({}, kt, { default: false, test: undefined }));
        return kt;
    }
    onError(tagToken, 'TAG_RESOLVE_FAILED', `Unresolved tag: ${tagName}`, tagName !== 'tag:yaml.org,2002:str');
    return schema[identity.SCALAR];
}
function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
    const tag = schema.tags.find(tag => (tag.default === true || (atKey && tag.default === 'key')) &&
        tag.test?.test(value)) || schema[identity.SCALAR];
    if (schema.compat) {
        const compat = schema.compat.find(tag => tag.default && tag.test?.test(value)) ??
            schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
            const ts = directives.tagString(tag.tag);
            const cs = directives.tagString(compat.tag);
            const msg = `Value may be parsed as either ${ts} or ${cs}`;
            onError(token, 'TAG_RESOLVE_FAILED', msg, true);
        }
    }
    return tag;
}

exports.composeScalar = composeScalar;


/***/ }),

/***/ 9261:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var node_process = __nccwpck_require__(932);
var directives = __nccwpck_require__(5939);
var Document = __nccwpck_require__(5244);
var errors = __nccwpck_require__(1269);
var identity = __nccwpck_require__(3662);
var composeDoc = __nccwpck_require__(4324);
var resolveEnd = __nccwpck_require__(7919);

function getErrorPos(src) {
    if (typeof src === 'number')
        return [src, src + 1];
    if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
    const { offset, source } = src;
    return [offset, offset + (typeof source === 'string' ? source.length : 1)];
}
function parsePrelude(prelude) {
    let comment = '';
    let atComment = false;
    let afterEmptyLine = false;
    for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
            case '#':
                comment +=
                    (comment === '' ? '' : afterEmptyLine ? '\n\n' : '\n') +
                        (source.substring(1) || ' ');
                atComment = true;
                afterEmptyLine = false;
                break;
            case '%':
                if (prelude[i + 1]?.[0] !== '#')
                    i += 1;
                atComment = false;
                break;
            default:
                // This may be wrong after doc-end, but in that case it doesn't matter
                if (!atComment)
                    afterEmptyLine = true;
                atComment = false;
        }
    }
    return { comment, afterEmptyLine };
}
/**
 * Compose a stream of CST nodes into a stream of YAML Documents.
 *
 * ```ts
 * import { Composer, Parser } from 'yaml'
 *
 * const src: string = ...
 * const tokens = new Parser().parse(src)
 * const docs = new Composer().compose(tokens)
 * ```
 */
class Composer {
    constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
            const pos = getErrorPos(source);
            if (warning)
                this.warnings.push(new errors.YAMLWarning(pos, code, message));
            else
                this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        this.directives = new directives.Directives({ version: options.version || '1.2' });
        this.options = options;
    }
    decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        //console.log({ dc: doc.comment, prelude, comment })
        if (comment) {
            const dc = doc.contents;
            if (afterDoc) {
                doc.comment = doc.comment ? `${doc.comment}\n${comment}` : comment;
            }
            else if (afterEmptyLine || doc.directives.docStart || !dc) {
                doc.commentBefore = comment;
            }
            else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
                let it = dc.items[0];
                if (identity.isPair(it))
                    it = it.key;
                const cb = it.commentBefore;
                it.commentBefore = cb ? `${comment}\n${cb}` : comment;
            }
            else {
                const cb = dc.commentBefore;
                dc.commentBefore = cb ? `${comment}\n${cb}` : comment;
            }
        }
        if (afterDoc) {
            for (let i = 0; i < this.errors.length; ++i)
                doc.errors.push(this.errors[i]);
            for (let i = 0; i < this.warnings.length; ++i)
                doc.warnings.push(this.warnings[i]);
        }
        else {
            doc.errors = this.errors;
            doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
    }
    /**
     * Current stream status information.
     *
     * Mostly useful at the end of input for an empty stream.
     */
    streamInfo() {
        return {
            comment: parsePrelude(this.prelude).comment,
            directives: this.directives,
            errors: this.errors,
            warnings: this.warnings
        };
    }
    /**
     * Compose tokens into documents.
     *
     * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
     * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
     */
    *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
            yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
    }
    /** Advance the composer by one CST token. */
    *next(token) {
        if (node_process.env.LOG_STREAM)
            console.dir(token, { depth: null });
        switch (token.type) {
            case 'directive':
                this.directives.add(token.source, (offset, message, warning) => {
                    const pos = getErrorPos(token);
                    pos[0] += offset;
                    this.onError(pos, 'BAD_DIRECTIVE', message, warning);
                });
                this.prelude.push(token.source);
                this.atDirectives = true;
                break;
            case 'document': {
                const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
                if (this.atDirectives && !doc.directives.docStart)
                    this.onError(token, 'MISSING_CHAR', 'Missing directives-end/doc-start indicator line');
                this.decorate(doc, false);
                if (this.doc)
                    yield this.doc;
                this.doc = doc;
                this.atDirectives = false;
                break;
            }
            case 'byte-order-mark':
            case 'space':
                break;
            case 'comment':
            case 'newline':
                this.prelude.push(token.source);
                break;
            case 'error': {
                const msg = token.source
                    ? `${token.message}: ${JSON.stringify(token.source)}`
                    : token.message;
                const error = new errors.YAMLParseError(getErrorPos(token), 'UNEXPECTED_TOKEN', msg);
                if (this.atDirectives || !this.doc)
                    this.errors.push(error);
                else
                    this.doc.errors.push(error);
                break;
            }
            case 'doc-end': {
                if (!this.doc) {
                    const msg = 'Unexpected doc-end without preceding document';
                    this.errors.push(new errors.YAMLParseError(getErrorPos(token), 'UNEXPECTED_TOKEN', msg));
                    break;
                }
                this.doc.directives.docEnd = true;
                const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
                this.decorate(this.doc, true);
                if (end.comment) {
                    const dc = this.doc.comment;
                    this.doc.comment = dc ? `${dc}\n${end.comment}` : end.comment;
                }
                this.doc.range[2] = end.offset;
                break;
            }
            default:
                this.errors.push(new errors.YAMLParseError(getErrorPos(token), 'UNEXPECTED_TOKEN', `Unsupported token ${token.type}`));
        }
    }
    /**
     * Call at end of input to yield any remaining document.
     *
     * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
     * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
     */
    *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
            this.decorate(this.doc, true);
            yield this.doc;
            this.doc = null;
        }
        else if (forceDoc) {
            const opts = Object.assign({ _directives: this.directives }, this.options);
            const doc = new Document.Document(undefined, opts);
            if (this.atDirectives)
                this.onError(endOffset, 'MISSING_CHAR', 'Missing directives-end indicator line');
            doc.range = [0, endOffset, endOffset];
            this.decorate(doc, false);
            yield doc;
        }
    }
}

exports.Composer = Composer;


/***/ }),

/***/ 6448:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Pair = __nccwpck_require__(7664);
var YAMLMap = __nccwpck_require__(2613);
var resolveProps = __nccwpck_require__(7940);
var utilContainsNewline = __nccwpck_require__(9600);
var utilFlowIndentCheck = __nccwpck_require__(2270);
var utilMapIncludes = __nccwpck_require__(3904);

const startColMsg = 'All mapping items must start at the same column';
function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
    const map = new NodeClass(ctx.schema);
    if (ctx.atRoot)
        ctx.atRoot = false;
    let offset = bm.offset;
    let commentEnd = null;
    for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        // key properties
        const keyProps = resolveProps.resolveProps(start, {
            indicator: 'explicit-key-ind',
            next: key ?? sep?.[0],
            offset,
            onError,
            parentIndent: bm.indent,
            startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
            if (key) {
                if (key.type === 'block-seq')
                    onError(offset, 'BLOCK_AS_IMPLICIT_KEY', 'A block sequence may not be used as an implicit map key');
                else if ('indent' in key && key.indent !== bm.indent)
                    onError(offset, 'BAD_INDENT', startColMsg);
            }
            if (!keyProps.anchor && !keyProps.tag && !sep) {
                commentEnd = keyProps.end;
                if (keyProps.comment) {
                    if (map.comment)
                        map.comment += '\n' + keyProps.comment;
                    else
                        map.comment = keyProps.comment;
                }
                continue;
            }
            if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
                onError(key ?? start[start.length - 1], 'MULTILINE_IMPLICIT_KEY', 'Implicit keys need to be on a single line');
            }
        }
        else if (keyProps.found?.indent !== bm.indent) {
            onError(offset, 'BAD_INDENT', startColMsg);
        }
        // key value
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key
            ? composeNode(ctx, key, keyProps, onError)
            : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
            onError(keyStart, 'DUPLICATE_KEY', 'Map keys must be unique');
        // value properties
        const valueProps = resolveProps.resolveProps(sep ?? [], {
            indicator: 'map-value-ind',
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: bm.indent,
            startOnNewline: !key || key.type === 'block-scalar'
        });
        offset = valueProps.end;
        if (valueProps.found) {
            if (implicitKey) {
                if (value?.type === 'block-map' && !valueProps.hasNewline)
                    onError(offset, 'BLOCK_AS_IMPLICIT_KEY', 'Nested mappings are not allowed in compact mappings');
                if (ctx.options.strict &&
                    keyProps.start < valueProps.found.offset - 1024)
                    onError(keyNode.range, 'KEY_OVER_1024_CHARS', 'The : indicator must be at most 1024 chars after the start of an implicit block mapping key');
            }
            // value value
            const valueNode = value
                ? composeNode(ctx, value, valueProps, onError)
                : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
            if (ctx.schema.compat)
                utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
            offset = valueNode.range[2];
            const pair = new Pair.Pair(keyNode, valueNode);
            if (ctx.options.keepSourceTokens)
                pair.srcToken = collItem;
            map.items.push(pair);
        }
        else {
            // key with no value
            if (implicitKey)
                onError(keyNode.range, 'MISSING_CHAR', 'Implicit map keys need to be followed by map values');
            if (valueProps.comment) {
                if (keyNode.comment)
                    keyNode.comment += '\n' + valueProps.comment;
                else
                    keyNode.comment = valueProps.comment;
            }
            const pair = new Pair.Pair(keyNode);
            if (ctx.options.keepSourceTokens)
                pair.srcToken = collItem;
            map.items.push(pair);
        }
    }
    if (commentEnd && commentEnd < offset)
        onError(commentEnd, 'IMPOSSIBLE', 'Map comment with trailing content');
    map.range = [bm.offset, offset, commentEnd ?? offset];
    return map;
}

exports.resolveBlockMap = resolveBlockMap;


/***/ }),

/***/ 1788:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);

function resolveBlockScalar(ctx, scalar, onError) {
    const start = scalar.offset;
    const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
    if (!header)
        return { value: '', type: null, comment: '', range: [start, start, start] };
    const type = header.mode === '>' ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
    const lines = scalar.source ? splitLines(scalar.source) : [];
    // determine the end of content & start of chomping
    let chompStart = lines.length;
    for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === '' || content === '\r')
            chompStart = i;
        else
            break;
    }
    // shortcut for empty contents
    if (chompStart === 0) {
        const value = header.chomp === '+' && lines.length > 0
            ? '\n'.repeat(Math.max(1, lines.length - 1))
            : '';
        let end = start + header.length;
        if (scalar.source)
            end += scalar.source.length;
        return { value, type, comment: header.comment, range: [start, end, end] };
    }
    // find the indentation level to trim from start
    let trimIndent = scalar.indent + header.indent;
    let offset = scalar.offset + header.length;
    let contentStart = 0;
    for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === '' || content === '\r') {
            if (header.indent === 0 && indent.length > trimIndent)
                trimIndent = indent.length;
        }
        else {
            if (indent.length < trimIndent) {
                const message = 'Block scalars with more-indented leading empty lines must use an explicit indentation indicator';
                onError(offset + indent.length, 'MISSING_CHAR', message);
            }
            if (header.indent === 0)
                trimIndent = indent.length;
            contentStart = i;
            if (trimIndent === 0 && !ctx.atRoot) {
                const message = 'Block scalar values in collections must be indented';
                onError(offset, 'BAD_INDENT', message);
            }
            break;
        }
        offset += indent.length + content.length + 1;
    }
    // include trailing more-indented empty lines in content
    for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
            chompStart = i + 1;
    }
    let value = '';
    let sep = '';
    let prevMoreIndented = false;
    // leading whitespace is kept intact
    for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + '\n';
    for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === '\r';
        if (crlf)
            content = content.slice(0, -1);
        /* istanbul ignore if already caught in lexer */
        if (content && indent.length < trimIndent) {
            const src = header.indent
                ? 'explicit indentation indicator'
                : 'first line';
            const message = `Block scalar lines must not be less indented than their ${src}`;
            onError(offset - content.length - (crlf ? 2 : 1), 'BAD_INDENT', message);
            indent = '';
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
            value += sep + indent.slice(trimIndent) + content;
            sep = '\n';
        }
        else if (indent.length > trimIndent || content[0] === '\t') {
            // more-indented content within a folded block
            if (sep === ' ')
                sep = '\n';
            else if (!prevMoreIndented && sep === '\n')
                sep = '\n\n';
            value += sep + indent.slice(trimIndent) + content;
            sep = '\n';
            prevMoreIndented = true;
        }
        else if (content === '') {
            // empty line
            if (sep === '\n')
                value += '\n';
            else
                sep = '\n';
        }
        else {
            value += sep + content;
            sep = ' ';
            prevMoreIndented = false;
        }
    }
    switch (header.chomp) {
        case '-':
            break;
        case '+':
            for (let i = chompStart; i < lines.length; ++i)
                value += '\n' + lines[i][0].slice(trimIndent);
            if (value[value.length - 1] !== '\n')
                value += '\n';
            break;
        default:
            value += '\n';
    }
    const end = start + header.length + scalar.source.length;
    return { value, type, comment: header.comment, range: [start, end, end] };
}
function parseBlockScalarHeader({ offset, props }, strict, onError) {
    /* istanbul ignore if should not happen */
    if (props[0].type !== 'block-scalar-header') {
        onError(props[0], 'IMPOSSIBLE', 'Block scalar header not found');
        return null;
    }
    const { source } = props[0];
    const mode = source[0];
    let indent = 0;
    let chomp = '';
    let error = -1;
    for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === '-' || ch === '+'))
            chomp = ch;
        else {
            const n = Number(ch);
            if (!indent && n)
                indent = n;
            else if (error === -1)
                error = offset + i;
        }
    }
    if (error !== -1)
        onError(error, 'UNEXPECTED_TOKEN', `Block scalar header includes extra characters: ${source}`);
    let hasSpace = false;
    let comment = '';
    let length = source.length;
    for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
            case 'space':
                hasSpace = true;
            // fallthrough
            case 'newline':
                length += token.source.length;
                break;
            case 'comment':
                if (strict && !hasSpace) {
                    const message = 'Comments must be separated from other tokens by white space characters';
                    onError(token, 'MISSING_CHAR', message);
                }
                length += token.source.length;
                comment = token.source.substring(1);
                break;
            case 'error':
                onError(token, 'UNEXPECTED_TOKEN', token.message);
                length += token.source.length;
                break;
            /* istanbul ignore next should not happen */
            default: {
                const message = `Unexpected token in block scalar header: ${token.type}`;
                onError(token, 'UNEXPECTED_TOKEN', message);
                const ts = token.source;
                if (ts && typeof ts === 'string')
                    length += ts.length;
            }
        }
    }
    return { mode, indent, chomp, comment, length };
}
/** @returns Array of lines split up as `[indent, content]` */
function splitLines(source) {
    const split = source.split(/\n( *)/);
    const first = split[0];
    const m = first.match(/^( *)/);
    const line0 = m?.[1]
        ? [m[1], first.slice(m[1].length)]
        : ['', first];
    const lines = [line0];
    for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
    return lines;
}

exports.resolveBlockScalar = resolveBlockScalar;


/***/ }),

/***/ 5397:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var YAMLSeq = __nccwpck_require__(3584);
var resolveProps = __nccwpck_require__(7940);
var utilFlowIndentCheck = __nccwpck_require__(2270);

function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
    const seq = new NodeClass(ctx.schema);
    if (ctx.atRoot)
        ctx.atRoot = false;
    if (ctx.atKey)
        ctx.atKey = false;
    let offset = bs.offset;
    let commentEnd = null;
    for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
            indicator: 'seq-item-ind',
            next: value,
            offset,
            onError,
            parentIndent: bs.indent,
            startOnNewline: true
        });
        if (!props.found) {
            if (props.anchor || props.tag || value) {
                if (value?.type === 'block-seq')
                    onError(props.end, 'BAD_INDENT', 'All sequence items must start at the same column');
                else
                    onError(offset, 'MISSING_CHAR', 'Sequence item without - indicator');
            }
            else {
                commentEnd = props.end;
                if (props.comment)
                    seq.comment = props.comment;
                continue;
            }
        }
        const node = value
            ? composeNode(ctx, value, props, onError)
            : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
    }
    seq.range = [bs.offset, offset, commentEnd ?? offset];
    return seq;
}

exports.resolveBlockSeq = resolveBlockSeq;


/***/ }),

/***/ 7919:
/***/ ((__unused_webpack_module, exports) => {



function resolveEnd(end, offset, reqSpace, onError) {
    let comment = '';
    if (end) {
        let hasSpace = false;
        let sep = '';
        for (const token of end) {
            const { source, type } = token;
            switch (type) {
                case 'space':
                    hasSpace = true;
                    break;
                case 'comment': {
                    if (reqSpace && !hasSpace)
                        onError(token, 'MISSING_CHAR', 'Comments must be separated from other tokens by white space characters');
                    const cb = source.substring(1) || ' ';
                    if (!comment)
                        comment = cb;
                    else
                        comment += sep + cb;
                    sep = '';
                    break;
                }
                case 'newline':
                    if (comment)
                        sep += source;
                    hasSpace = true;
                    break;
                default:
                    onError(token, 'UNEXPECTED_TOKEN', `Unexpected ${type} at node end`);
            }
            offset += source.length;
        }
    }
    return { comment, offset };
}

exports.resolveEnd = resolveEnd;


/***/ }),

/***/ 737:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var Pair = __nccwpck_require__(7664);
var YAMLMap = __nccwpck_require__(2613);
var YAMLSeq = __nccwpck_require__(3584);
var resolveEnd = __nccwpck_require__(7919);
var resolveProps = __nccwpck_require__(7940);
var utilContainsNewline = __nccwpck_require__(9600);
var utilMapIncludes = __nccwpck_require__(3904);

const blockMsg = 'Block collections are not allowed within flow collections';
const isBlock = (token) => token && (token.type === 'block-map' || token.type === 'block-seq');
function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
    const isMap = fc.start.source === '{';
    const fcName = isMap ? 'flow map' : 'flow sequence';
    const NodeClass = (tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq));
    const coll = new NodeClass(ctx.schema);
    coll.flow = true;
    const atRoot = ctx.atRoot;
    if (atRoot)
        ctx.atRoot = false;
    if (ctx.atKey)
        ctx.atKey = false;
    let offset = fc.offset + fc.start.source.length;
    for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
            flow: fcName,
            indicator: 'explicit-key-ind',
            next: key ?? sep?.[0],
            offset,
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
        });
        if (!props.found) {
            if (!props.anchor && !props.tag && !sep && !value) {
                if (i === 0 && props.comma)
                    onError(props.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${fcName}`);
                else if (i < fc.items.length - 1)
                    onError(props.start, 'UNEXPECTED_TOKEN', `Unexpected empty item in ${fcName}`);
                if (props.comment) {
                    if (coll.comment)
                        coll.comment += '\n' + props.comment;
                    else
                        coll.comment = props.comment;
                }
                offset = props.end;
                continue;
            }
            if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
                onError(key, // checked by containsNewline()
                'MULTILINE_IMPLICIT_KEY', 'Implicit keys of flow sequence pairs need to be on a single line');
        }
        if (i === 0) {
            if (props.comma)
                onError(props.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${fcName}`);
        }
        else {
            if (!props.comma)
                onError(props.start, 'MISSING_CHAR', `Missing , between ${fcName} items`);
            if (props.comment) {
                let prevItemComment = '';
                loop: for (const st of start) {
                    switch (st.type) {
                        case 'comma':
                        case 'space':
                            break;
                        case 'comment':
                            prevItemComment = st.source.substring(1);
                            break loop;
                        default:
                            break loop;
                    }
                }
                if (prevItemComment) {
                    let prev = coll.items[coll.items.length - 1];
                    if (identity.isPair(prev))
                        prev = prev.value ?? prev.key;
                    if (prev.comment)
                        prev.comment += '\n' + prevItemComment;
                    else
                        prev.comment = prevItemComment;
                    props.comment = props.comment.substring(prevItemComment.length + 1);
                }
            }
        }
        if (!isMap && !sep && !props.found) {
            // item is a value in a seq
            // → key & sep are empty, start does not include ? or :
            const valueNode = value
                ? composeNode(ctx, value, props, onError)
                : composeEmptyNode(ctx, props.end, sep, null, props, onError);
            coll.items.push(valueNode);
            offset = valueNode.range[2];
            if (isBlock(value))
                onError(valueNode.range, 'BLOCK_IN_FLOW', blockMsg);
        }
        else {
            // item is a key+value pair
            // key value
            ctx.atKey = true;
            const keyStart = props.end;
            const keyNode = key
                ? composeNode(ctx, key, props, onError)
                : composeEmptyNode(ctx, keyStart, start, null, props, onError);
            if (isBlock(key))
                onError(keyNode.range, 'BLOCK_IN_FLOW', blockMsg);
            ctx.atKey = false;
            // value properties
            const valueProps = resolveProps.resolveProps(sep ?? [], {
                flow: fcName,
                indicator: 'map-value-ind',
                next: value,
                offset: keyNode.range[2],
                onError,
                parentIndent: fc.indent,
                startOnNewline: false
            });
            if (valueProps.found) {
                if (!isMap && !props.found && ctx.options.strict) {
                    if (sep)
                        for (const st of sep) {
                            if (st === valueProps.found)
                                break;
                            if (st.type === 'newline') {
                                onError(st, 'MULTILINE_IMPLICIT_KEY', 'Implicit keys of flow sequence pairs need to be on a single line');
                                break;
                            }
                        }
                    if (props.start < valueProps.found.offset - 1024)
                        onError(valueProps.found, 'KEY_OVER_1024_CHARS', 'The : indicator must be at most 1024 chars after the start of an implicit flow sequence key');
                }
            }
            else if (value) {
                if ('source' in value && value.source?.[0] === ':')
                    onError(value, 'MISSING_CHAR', `Missing space after : in ${fcName}`);
                else
                    onError(valueProps.start, 'MISSING_CHAR', `Missing , or : between ${fcName} items`);
            }
            // value value
            const valueNode = value
                ? composeNode(ctx, value, valueProps, onError)
                : valueProps.found
                    ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError)
                    : null;
            if (valueNode) {
                if (isBlock(value))
                    onError(valueNode.range, 'BLOCK_IN_FLOW', blockMsg);
            }
            else if (valueProps.comment) {
                if (keyNode.comment)
                    keyNode.comment += '\n' + valueProps.comment;
                else
                    keyNode.comment = valueProps.comment;
            }
            const pair = new Pair.Pair(keyNode, valueNode);
            if (ctx.options.keepSourceTokens)
                pair.srcToken = collItem;
            if (isMap) {
                const map = coll;
                if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
                    onError(keyStart, 'DUPLICATE_KEY', 'Map keys must be unique');
                map.items.push(pair);
            }
            else {
                const map = new YAMLMap.YAMLMap(ctx.schema);
                map.flow = true;
                map.items.push(pair);
                const endRange = (valueNode ?? keyNode).range;
                map.range = [keyNode.range[0], endRange[1], endRange[2]];
                coll.items.push(map);
            }
            offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
    }
    const expectedEnd = isMap ? '}' : ']';
    const [ce, ...ee] = fc.end;
    let cePos = offset;
    if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
    else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot
            ? `${name} must end with a ${expectedEnd}`
            : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? 'MISSING_CHAR' : 'BAD_INDENT', msg);
        if (ce && ce.source.length !== 1)
            ee.unshift(ce);
    }
    if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
            if (coll.comment)
                coll.comment += '\n' + end.comment;
            else
                coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
    }
    else {
        coll.range = [fc.offset, cePos, cePos];
    }
    return coll;
}

exports.resolveFlowCollection = resolveFlowCollection;


/***/ }),

/***/ 4513:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);
var resolveEnd = __nccwpck_require__(7919);

function resolveFlowScalar(scalar, strict, onError) {
    const { offset, type, source, end } = scalar;
    let _type;
    let value;
    const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
    switch (type) {
        case 'scalar':
            _type = Scalar.Scalar.PLAIN;
            value = plainValue(source, _onError);
            break;
        case 'single-quoted-scalar':
            _type = Scalar.Scalar.QUOTE_SINGLE;
            value = singleQuotedValue(source, _onError);
            break;
        case 'double-quoted-scalar':
            _type = Scalar.Scalar.QUOTE_DOUBLE;
            value = doubleQuotedValue(source, _onError);
            break;
        /* istanbul ignore next should not happen */
        default:
            onError(scalar, 'UNEXPECTED_TOKEN', `Expected a flow scalar value, but found: ${type}`);
            return {
                value: '',
                type: null,
                comment: '',
                range: [offset, offset + source.length, offset + source.length]
            };
    }
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
    return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
    };
}
function plainValue(source, onError) {
    let badChar = '';
    switch (source[0]) {
        /* istanbul ignore next should not happen */
        case '\t':
            badChar = 'a tab character';
            break;
        case ',':
            badChar = 'flow indicator character ,';
            break;
        case '%':
            badChar = 'directive indicator character %';
            break;
        case '|':
        case '>': {
            badChar = `block scalar indicator ${source[0]}`;
            break;
        }
        case '@':
        case '`': {
            badChar = `reserved character ${source[0]}`;
            break;
        }
    }
    if (badChar)
        onError(0, 'BAD_SCALAR_START', `Plain value cannot start with ${badChar}`);
    return foldLines(source);
}
function singleQuotedValue(source, onError) {
    if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, 'MISSING_CHAR', "Missing closing 'quote");
    return foldLines(source.slice(1, -1)).replace(/''/g, "'");
}
function foldLines(source) {
    /**
     * The negative lookbehind here and in the `re` RegExp is to
     * prevent causing a polynomial search time in certain cases.
     *
     * The try-catch is for Safari, which doesn't support this yet:
     * https://caniuse.com/js-regexp-lookbehind
     */
    let first, line;
    try {
        first = new RegExp('(.*?)(?<![ \t])[ \t]*\r?\n', 'sy');
        line = new RegExp('[ \t]*(.*?)(?:(?<![ \t])[ \t]*)?\r?\n', 'sy');
    }
    catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
    }
    let match = first.exec(source);
    if (!match)
        return source;
    let res = match[1];
    let sep = ' ';
    let pos = first.lastIndex;
    line.lastIndex = pos;
    while ((match = line.exec(source))) {
        if (match[1] === '') {
            if (sep === '\n')
                res += sep;
            else
                sep = '\n';
        }
        else {
            res += sep + match[1];
            sep = ' ';
        }
        pos = line.lastIndex;
    }
    const last = /[ \t]*(.*)/sy;
    last.lastIndex = pos;
    match = last.exec(source);
    return res + sep + (match?.[1] ?? '');
}
function doubleQuotedValue(source, onError) {
    let res = '';
    for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === '\r' && source[i + 1] === '\n')
            continue;
        if (ch === '\n') {
            const { fold, offset } = foldNewline(source, i);
            res += fold;
            i = offset;
        }
        else if (ch === '\\') {
            let next = source[++i];
            const cc = escapeCodes[next];
            if (cc)
                res += cc;
            else if (next === '\n') {
                // skip escaped newlines, but still trim the following line
                next = source[i + 1];
                while (next === ' ' || next === '\t')
                    next = source[++i + 1];
            }
            else if (next === '\r' && source[i + 1] === '\n') {
                // skip escaped CRLF newlines, but still trim the following line
                next = source[++i + 1];
                while (next === ' ' || next === '\t')
                    next = source[++i + 1];
            }
            else if (next === 'x' || next === 'u' || next === 'U') {
                const length = next === 'x' ? 2 : next === 'u' ? 4 : 8;
                res += parseCharCode(source, i + 1, length, onError);
                i += length;
            }
            else {
                const raw = source.substr(i - 1, 2);
                onError(i - 1, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${raw}`);
                res += raw;
            }
        }
        else if (ch === ' ' || ch === '\t') {
            // trim trailing whitespace
            const wsStart = i;
            let next = source[i + 1];
            while (next === ' ' || next === '\t')
                next = source[++i + 1];
            if (next !== '\n' && !(next === '\r' && source[i + 2] === '\n'))
                res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        }
        else {
            res += ch;
        }
    }
    if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, 'MISSING_CHAR', 'Missing closing "quote');
    return res;
}
/**
 * Fold a single newline into a space, multiple newlines to N - 1 newlines.
 * Presumes `source[offset] === '\n'`
 */
function foldNewline(source, offset) {
    let fold = '';
    let ch = source[offset + 1];
    while (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        if (ch === '\r' && source[offset + 2] !== '\n')
            break;
        if (ch === '\n')
            fold += '\n';
        offset += 1;
        ch = source[offset + 1];
    }
    if (!fold)
        fold = ' ';
    return { fold, offset };
}
const escapeCodes = {
    '0': '\0', // null character
    a: '\x07', // bell character
    b: '\b', // backspace
    e: '\x1b', // escape character
    f: '\f', // form feed
    n: '\n', // line feed
    r: '\r', // carriage return
    t: '\t', // horizontal tab
    v: '\v', // vertical tab
    N: '\u0085', // Unicode next line
    _: '\u00a0', // Unicode non-breaking space
    L: '\u2028', // Unicode line separator
    P: '\u2029', // Unicode paragraph separator
    ' ': ' ',
    '"': '"',
    '/': '/',
    '\\': '\\',
    '\t': '\t'
};
function parseCharCode(source, offset, length, onError) {
    const cc = source.substr(offset, length);
    const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
    const code = ok ? parseInt(cc, 16) : NaN;
    try {
        return String.fromCodePoint(code);
    }
    catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${raw}`);
        return raw;
    }
}

exports.resolveFlowScalar = resolveFlowScalar;


/***/ }),

/***/ 7940:
/***/ ((__unused_webpack_module, exports) => {



function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
    let spaceBefore = false;
    let atNewline = startOnNewline;
    let hasSpace = startOnNewline;
    let comment = '';
    let commentSep = '';
    let hasNewline = false;
    let reqSpace = false;
    let tab = null;
    let anchor = null;
    let tag = null;
    let newlineAfterProp = null;
    let comma = null;
    let found = null;
    let start = null;
    for (const token of tokens) {
        if (reqSpace) {
            if (token.type !== 'space' &&
                token.type !== 'newline' &&
                token.type !== 'comma')
                onError(token.offset, 'MISSING_CHAR', 'Tags and anchors must be separated from the next token by white space');
            reqSpace = false;
        }
        if (tab) {
            if (atNewline && token.type !== 'comment' && token.type !== 'newline') {
                onError(tab, 'TAB_AS_INDENT', 'Tabs are not allowed as indentation');
            }
            tab = null;
        }
        switch (token.type) {
            case 'space':
                // At the doc level, tabs at line start may be parsed
                // as leading white space rather than indentation.
                // In a flow collection, only the parser handles indent.
                if (!flow &&
                    (indicator !== 'doc-start' || next?.type !== 'flow-collection') &&
                    token.source.includes('\t')) {
                    tab = token;
                }
                hasSpace = true;
                break;
            case 'comment': {
                if (!hasSpace)
                    onError(token, 'MISSING_CHAR', 'Comments must be separated from other tokens by white space characters');
                const cb = token.source.substring(1) || ' ';
                if (!comment)
                    comment = cb;
                else
                    comment += commentSep + cb;
                commentSep = '';
                atNewline = false;
                break;
            }
            case 'newline':
                if (atNewline) {
                    if (comment)
                        comment += token.source;
                    else if (!found || indicator !== 'seq-item-ind')
                        spaceBefore = true;
                }
                else
                    commentSep += token.source;
                atNewline = true;
                hasNewline = true;
                if (anchor || tag)
                    newlineAfterProp = token;
                hasSpace = true;
                break;
            case 'anchor':
                if (anchor)
                    onError(token, 'MULTIPLE_ANCHORS', 'A node can have at most one anchor');
                if (token.source.endsWith(':'))
                    onError(token.offset + token.source.length - 1, 'BAD_ALIAS', 'Anchor ending in : is ambiguous', true);
                anchor = token;
                start ?? (start = token.offset);
                atNewline = false;
                hasSpace = false;
                reqSpace = true;
                break;
            case 'tag': {
                if (tag)
                    onError(token, 'MULTIPLE_TAGS', 'A node can have at most one tag');
                tag = token;
                start ?? (start = token.offset);
                atNewline = false;
                hasSpace = false;
                reqSpace = true;
                break;
            }
            case indicator:
                // Could here handle preceding comments differently
                if (anchor || tag)
                    onError(token, 'BAD_PROP_ORDER', `Anchors and tags must be after the ${token.source} indicator`);
                if (found)
                    onError(token, 'UNEXPECTED_TOKEN', `Unexpected ${token.source} in ${flow ?? 'collection'}`);
                found = token;
                atNewline =
                    indicator === 'seq-item-ind' || indicator === 'explicit-key-ind';
                hasSpace = false;
                break;
            case 'comma':
                if (flow) {
                    if (comma)
                        onError(token, 'UNEXPECTED_TOKEN', `Unexpected , in ${flow}`);
                    comma = token;
                    atNewline = false;
                    hasSpace = false;
                    break;
                }
            // else fallthrough
            default:
                onError(token, 'UNEXPECTED_TOKEN', `Unexpected ${token.type} token`);
                atNewline = false;
                hasSpace = false;
        }
    }
    const last = tokens[tokens.length - 1];
    const end = last ? last.offset + last.source.length : offset;
    if (reqSpace &&
        next &&
        next.type !== 'space' &&
        next.type !== 'newline' &&
        next.type !== 'comma' &&
        (next.type !== 'scalar' || next.source !== '')) {
        onError(next.offset, 'MISSING_CHAR', 'Tags and anchors must be separated from the next token by white space');
    }
    if (tab &&
        ((atNewline && tab.indent <= parentIndent) ||
            next?.type === 'block-map' ||
            next?.type === 'block-seq'))
        onError(tab, 'TAB_AS_INDENT', 'Tabs are not allowed as indentation');
    return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
    };
}

exports.resolveProps = resolveProps;


/***/ }),

/***/ 9600:
/***/ ((__unused_webpack_module, exports) => {



function containsNewline(key) {
    if (!key)
        return null;
    switch (key.type) {
        case 'alias':
        case 'scalar':
        case 'double-quoted-scalar':
        case 'single-quoted-scalar':
            if (key.source.includes('\n'))
                return true;
            if (key.end)
                for (const st of key.end)
                    if (st.type === 'newline')
                        return true;
            return false;
        case 'flow-collection':
            for (const it of key.items) {
                for (const st of it.start)
                    if (st.type === 'newline')
                        return true;
                if (it.sep)
                    for (const st of it.sep)
                        if (st.type === 'newline')
                            return true;
                if (containsNewline(it.key) || containsNewline(it.value))
                    return true;
            }
            return false;
        default:
            return true;
    }
}

exports.containsNewline = containsNewline;


/***/ }),

/***/ 382:
/***/ ((__unused_webpack_module, exports) => {



function emptyScalarPosition(offset, before, pos) {
    if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
            let st = before[i];
            switch (st.type) {
                case 'space':
                case 'comment':
                case 'newline':
                    offset -= st.source.length;
                    continue;
            }
            // Technically, an empty scalar is immediately after the last non-empty
            // node, but it's more useful to place it after any whitespace.
            st = before[++i];
            while (st?.type === 'space') {
                offset += st.source.length;
                st = before[++i];
            }
            break;
        }
    }
    return offset;
}

exports.emptyScalarPosition = emptyScalarPosition;


/***/ }),

/***/ 2270:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var utilContainsNewline = __nccwpck_require__(9600);

function flowIndentCheck(indent, fc, onError) {
    if (fc?.type === 'flow-collection') {
        const end = fc.end[0];
        if (end.indent === indent &&
            (end.source === ']' || end.source === '}') &&
            utilContainsNewline.containsNewline(fc)) {
            const msg = 'Flow end indicator should be more indented than parent';
            onError(end, 'BAD_INDENT', msg, true);
        }
    }
}

exports.flowIndentCheck = flowIndentCheck;


/***/ }),

/***/ 3904:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);

function mapIncludes(ctx, items, search) {
    const { uniqueKeys } = ctx.options;
    if (uniqueKeys === false)
        return false;
    const isEqual = typeof uniqueKeys === 'function'
        ? uniqueKeys
        : (a, b) => a === b || (identity.isScalar(a) && identity.isScalar(b) && a.value === b.value);
    return items.some(pair => isEqual(pair.key, search));
}

exports.mapIncludes = mapIncludes;


/***/ }),

/***/ 5244:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Alias = __nccwpck_require__(7798);
var Collection = __nccwpck_require__(7616);
var identity = __nccwpck_require__(3662);
var Pair = __nccwpck_require__(7664);
var toJS = __nccwpck_require__(2150);
var Schema = __nccwpck_require__(3015);
var stringifyDocument = __nccwpck_require__(1994);
var anchors = __nccwpck_require__(7407);
var applyReviver = __nccwpck_require__(3660);
var createNode = __nccwpck_require__(6581);
var directives = __nccwpck_require__(5939);

class Document {
    constructor(value, replacer, options) {
        /** A comment before this Document */
        this.commentBefore = null;
        /** A comment immediately after this Document */
        this.comment = null;
        /** Errors encountered during parsing. */
        this.errors = [];
        /** Warnings encountered during parsing. */
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === 'function' || Array.isArray(replacer)) {
            _replacer = replacer;
        }
        else if (options === undefined && replacer) {
            options = replacer;
            replacer = undefined;
        }
        const opt = Object.assign({
            intAsBigInt: false,
            keepSourceTokens: false,
            logLevel: 'warn',
            prettyErrors: true,
            strict: true,
            stringKeys: false,
            uniqueKeys: true,
            version: '1.2'
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
            this.directives = options._directives.atDocument();
            if (this.directives.yaml.explicit)
                version = this.directives.yaml.version;
        }
        else
            this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        // @ts-expect-error We can't really know that this matches Contents.
        this.contents =
            value === undefined ? null : this.createNode(value, _replacer, options);
    }
    /**
     * Create a deep copy of this Document and its contents.
     *
     * Custom Node values that inherit from `Object` still refer to their original instances.
     */
    clone() {
        const copy = Object.create(Document.prototype, {
            [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
            copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        // @ts-expect-error We can't really know that this matches Contents.
        copy.contents = identity.isNode(this.contents)
            ? this.contents.clone(copy.schema)
            : this.contents;
        if (this.range)
            copy.range = this.range.slice();
        return copy;
    }
    /** Adds a value to the document. */
    add(value) {
        if (assertCollection(this.contents))
            this.contents.add(value);
    }
    /** Adds a value to the document. */
    addIn(path, value) {
        if (assertCollection(this.contents))
            this.contents.addIn(path, value);
    }
    /**
     * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
     *
     * If `node` already has an anchor, `name` is ignored.
     * Otherwise, the `node.anchor` value will be set to `name`,
     * or if an anchor with that name is already present in the document,
     * `name` will be used as a prefix for a new unique anchor.
     * If `name` is undefined, the generated anchor will use 'a' as a prefix.
     */
    createAlias(node, name) {
        if (!node.anchor) {
            const prev = anchors.anchorNames(this);
            node.anchor =
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                !name || prev.has(name) ? anchors.findNewAnchor(name || 'a', prev) : name;
        }
        return new Alias.Alias(node.anchor);
    }
    createNode(value, replacer, options) {
        let _replacer = undefined;
        if (typeof replacer === 'function') {
            value = replacer.call({ '': value }, '', value);
            _replacer = replacer;
        }
        else if (Array.isArray(replacer)) {
            const keyToStr = (v) => typeof v === 'number' || v instanceof String || v instanceof Number;
            const asStr = replacer.filter(keyToStr).map(String);
            if (asStr.length > 0)
                replacer = replacer.concat(asStr);
            _replacer = replacer;
        }
        else if (options === undefined && replacer) {
            options = replacer;
            replacer = undefined;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(this, 
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        anchorPrefix || 'a');
        const ctx = {
            aliasDuplicateObjects: aliasDuplicateObjects ?? true,
            keepUndefined: keepUndefined ?? false,
            onAnchor,
            onTagObj,
            replacer: _replacer,
            schema: this.schema,
            sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
            node.flow = true;
        setAnchors();
        return node;
    }
    /**
     * Convert a key and a value into a `Pair` using the current schema,
     * recursively wrapping all values as `Scalar` or `Collection` nodes.
     */
    createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
    }
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
    }
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
            if (this.contents == null)
                return false;
            // @ts-expect-error Presumed impossible if Strict extends false
            this.contents = null;
            return true;
        }
        return assertCollection(this.contents)
            ? this.contents.deleteIn(path)
            : false;
    }
    /**
     * Returns item at `key`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    get(key, keepScalar) {
        return identity.isCollection(this.contents)
            ? this.contents.get(key, keepScalar)
            : undefined;
    }
    /**
     * Returns item at `path`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
            return !keepScalar && identity.isScalar(this.contents)
                ? this.contents.value
                : this.contents;
        return identity.isCollection(this.contents)
            ? this.contents.getIn(path, keepScalar)
            : undefined;
    }
    /**
     * Checks if the document includes a value with the key `key`.
     */
    has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
    }
    /**
     * Checks if the document includes a value at `path`.
     */
    hasIn(path) {
        if (Collection.isEmptyPath(path))
            return this.contents !== undefined;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
    }
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    set(key, value) {
        if (this.contents == null) {
            // @ts-expect-error We can't really know that this matches Contents.
            this.contents = Collection.collectionFromPath(this.schema, [key], value);
        }
        else if (assertCollection(this.contents)) {
            this.contents.set(key, value);
        }
    }
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
            // @ts-expect-error We can't really know that this matches Contents.
            this.contents = value;
        }
        else if (this.contents == null) {
            // @ts-expect-error We can't really know that this matches Contents.
            this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        }
        else if (assertCollection(this.contents)) {
            this.contents.setIn(path, value);
        }
    }
    /**
     * Change the YAML version and schema used by the document.
     * A `null` version disables support for directives, explicit tags, anchors, and aliases.
     * It also requires the `schema` option to be given as a `Schema` instance value.
     *
     * Overrides all previously set schema options.
     */
    setSchema(version, options = {}) {
        if (typeof version === 'number')
            version = String(version);
        let opt;
        switch (version) {
            case '1.1':
                if (this.directives)
                    this.directives.yaml.version = '1.1';
                else
                    this.directives = new directives.Directives({ version: '1.1' });
                opt = { resolveKnownTags: false, schema: 'yaml-1.1' };
                break;
            case '1.2':
            case 'next':
                if (this.directives)
                    this.directives.yaml.version = version;
                else
                    this.directives = new directives.Directives({ version });
                opt = { resolveKnownTags: true, schema: 'core' };
                break;
            case null:
                if (this.directives)
                    delete this.directives;
                opt = null;
                break;
            default: {
                const sv = JSON.stringify(version);
                throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
            }
        }
        // Not using `instanceof Schema` to allow for duck typing
        if (options.schema instanceof Object)
            this.schema = options.schema;
        else if (opt)
            this.schema = new Schema.Schema(Object.assign(opt, options));
        else
            throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
    }
    // json & jsonArg are only used from toJSON()
    toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
            anchors: new Map(),
            doc: this,
            keep: !json,
            mapAsMap: mapAsMap === true,
            mapKeyWarned: false,
            maxAliasCount: typeof maxAliasCount === 'number' ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? '', ctx);
        if (typeof onAnchor === 'function')
            for (const { count, res } of ctx.anchors.values())
                onAnchor(res, count);
        return typeof reviver === 'function'
            ? applyReviver.applyReviver(reviver, { '': res }, '', res)
            : res;
    }
    /**
     * A JSON representation of the document `contents`.
     *
     * @param jsonArg Used by `JSON.stringify` to indicate the array index or
     *   property name.
     */
    toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
    }
    /** A YAML representation of the document. */
    toString(options = {}) {
        if (this.errors.length > 0)
            throw new Error('Document with errors cannot be stringified');
        if ('indent' in options &&
            (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
            const s = JSON.stringify(options.indent);
            throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
    }
}
function assertCollection(contents) {
    if (identity.isCollection(contents))
        return true;
    throw new Error('Expected a YAML collection as document contents');
}

exports.Document = Document;


/***/ }),

/***/ 7407:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var visit = __nccwpck_require__(2727);

/**
 * Verify that the input string is a valid anchor.
 *
 * Will throw on errors.
 */
function anchorIsValid(anchor) {
    if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
    }
    return true;
}
function anchorNames(root) {
    const anchors = new Set();
    visit.visit(root, {
        Value(_key, node) {
            if (node.anchor)
                anchors.add(node.anchor);
        }
    });
    return anchors;
}
/** Find a new anchor name with the given `prefix` and a one-indexed suffix. */
function findNewAnchor(prefix, exclude) {
    for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
            return name;
    }
}
function createNodeAnchors(doc, prefix) {
    const aliasObjects = [];
    const sourceObjects = new Map();
    let prevAnchors = null;
    return {
        onAnchor: (source) => {
            aliasObjects.push(source);
            prevAnchors ?? (prevAnchors = anchorNames(doc));
            const anchor = findNewAnchor(prefix, prevAnchors);
            prevAnchors.add(anchor);
            return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
            for (const source of aliasObjects) {
                const ref = sourceObjects.get(source);
                if (typeof ref === 'object' &&
                    ref.anchor &&
                    (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
                    ref.node.anchor = ref.anchor;
                }
                else {
                    const error = new Error('Failed to resolve repeated object (this should not happen)');
                    error.source = source;
                    throw error;
                }
            }
        },
        sourceObjects
    };
}

exports.anchorIsValid = anchorIsValid;
exports.anchorNames = anchorNames;
exports.createNodeAnchors = createNodeAnchors;
exports.findNewAnchor = findNewAnchor;


/***/ }),

/***/ 3660:
/***/ ((__unused_webpack_module, exports) => {



/**
 * Applies the JSON.parse reviver algorithm as defined in the ECMA-262 spec,
 * in section 24.5.1.1 "Runtime Semantics: InternalizeJSONProperty" of the
 * 2021 edition: https://tc39.es/ecma262/#sec-json.parse
 *
 * Includes extensions for handling Map and Set objects.
 */
function applyReviver(reviver, obj, key, val) {
    if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
            for (let i = 0, len = val.length; i < len; ++i) {
                const v0 = val[i];
                const v1 = applyReviver(reviver, val, String(i), v0);
                // eslint-disable-next-line @typescript-eslint/no-array-delete
                if (v1 === undefined)
                    delete val[i];
                else if (v1 !== v0)
                    val[i] = v1;
            }
        }
        else if (val instanceof Map) {
            for (const k of Array.from(val.keys())) {
                const v0 = val.get(k);
                const v1 = applyReviver(reviver, val, k, v0);
                if (v1 === undefined)
                    val.delete(k);
                else if (v1 !== v0)
                    val.set(k, v1);
            }
        }
        else if (val instanceof Set) {
            for (const v0 of Array.from(val)) {
                const v1 = applyReviver(reviver, val, v0, v0);
                if (v1 === undefined)
                    val.delete(v0);
                else if (v1 !== v0) {
                    val.delete(v0);
                    val.add(v1);
                }
            }
        }
        else {
            for (const [k, v0] of Object.entries(val)) {
                const v1 = applyReviver(reviver, val, k, v0);
                if (v1 === undefined)
                    delete val[k];
                else if (v1 !== v0)
                    val[k] = v1;
            }
        }
    }
    return reviver.call(obj, key, val);
}

exports.applyReviver = applyReviver;


/***/ }),

/***/ 6581:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Alias = __nccwpck_require__(7798);
var identity = __nccwpck_require__(3662);
var Scalar = __nccwpck_require__(8732);

const defaultTagPrefix = 'tag:yaml.org,2002:';
function findTagObject(value, tagName, tags) {
    if (tagName) {
        const match = tags.filter(t => t.tag === tagName);
        const tagObj = match.find(t => !t.format) ?? match[0];
        if (!tagObj)
            throw new Error(`Tag ${tagName} not found`);
        return tagObj;
    }
    return tags.find(t => t.identify?.(value) && !t.format);
}
function createNode(value, tagName, ctx) {
    if (identity.isDocument(value))
        value = value.contents;
    if (identity.isNode(value))
        return value;
    if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
    }
    if (value instanceof String ||
        value instanceof Number ||
        value instanceof Boolean ||
        (typeof BigInt !== 'undefined' && value instanceof BigInt) // not supported everywhere
    ) {
        // https://tc39.es/ecma262/#sec-serializejsonproperty
        value = value.valueOf();
    }
    const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
    // Detect duplicate references to the same object & use Alias nodes for all
    // after first. The `ref` wrapper allows for circular references to resolve.
    let ref = undefined;
    if (aliasDuplicateObjects && value && typeof value === 'object') {
        ref = sourceObjects.get(value);
        if (ref) {
            ref.anchor ?? (ref.anchor = onAnchor(value));
            return new Alias.Alias(ref.anchor);
        }
        else {
            ref = { anchor: null, node: null };
            sourceObjects.set(value, ref);
        }
    }
    if (tagName?.startsWith('!!'))
        tagName = defaultTagPrefix + tagName.slice(2);
    let tagObj = findTagObject(value, tagName, schema.tags);
    if (!tagObj) {
        if (value && typeof value.toJSON === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            value = value.toJSON();
        }
        if (!value || typeof value !== 'object') {
            const node = new Scalar.Scalar(value);
            if (ref)
                ref.node = node;
            return node;
        }
        tagObj =
            value instanceof Map
                ? schema[identity.MAP]
                : Symbol.iterator in Object(value)
                    ? schema[identity.SEQ]
                    : schema[identity.MAP];
    }
    if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
    }
    const node = tagObj?.createNode
        ? tagObj.createNode(ctx.schema, value, ctx)
        : typeof tagObj?.nodeClass?.from === 'function'
            ? tagObj.nodeClass.from(ctx.schema, value, ctx)
            : new Scalar.Scalar(value);
    if (tagName)
        node.tag = tagName;
    else if (!tagObj.default)
        node.tag = tagObj.tag;
    if (ref)
        ref.node = node;
    return node;
}

exports.createNode = createNode;


/***/ }),

/***/ 5939:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var visit = __nccwpck_require__(2727);

const escapeChars = {
    '!': '%21',
    ',': '%2C',
    '[': '%5B',
    ']': '%5D',
    '{': '%7B',
    '}': '%7D'
};
const escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, ch => escapeChars[ch]);
class Directives {
    constructor(yaml, tags) {
        /**
         * The directives-end/doc-start marker `---`. If `null`, a marker may still be
         * included in the document's stringified representation.
         */
        this.docStart = null;
        /** The doc-end marker `...`.  */
        this.docEnd = false;
        this.yaml = Object.assign({}, Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, Directives.defaultTags, tags);
    }
    clone() {
        const copy = new Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
    }
    /**
     * During parsing, get a Directives instance for the current document and
     * update the stream state according to the current version's spec.
     */
    atDocument() {
        const res = new Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
            case '1.1':
                this.atNextDocument = true;
                break;
            case '1.2':
                this.atNextDocument = false;
                this.yaml = {
                    explicit: Directives.defaultYaml.explicit,
                    version: '1.2'
                };
                this.tags = Object.assign({}, Directives.defaultTags);
                break;
        }
        return res;
    }
    /**
     * @param onError - May be called even if the action was successful
     * @returns `true` on success
     */
    add(line, onError) {
        if (this.atNextDocument) {
            this.yaml = { explicit: Directives.defaultYaml.explicit, version: '1.1' };
            this.tags = Object.assign({}, Directives.defaultTags);
            this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
            case '%TAG': {
                if (parts.length !== 2) {
                    onError(0, '%TAG directive should contain exactly two parts');
                    if (parts.length < 2)
                        return false;
                }
                const [handle, prefix] = parts;
                this.tags[handle] = prefix;
                return true;
            }
            case '%YAML': {
                this.yaml.explicit = true;
                if (parts.length !== 1) {
                    onError(0, '%YAML directive should contain exactly one part');
                    return false;
                }
                const [version] = parts;
                if (version === '1.1' || version === '1.2') {
                    this.yaml.version = version;
                    return true;
                }
                else {
                    const isValid = /^\d+\.\d+$/.test(version);
                    onError(6, `Unsupported YAML version ${version}`, isValid);
                    return false;
                }
            }
            default:
                onError(0, `Unknown directive ${name}`, true);
                return false;
        }
    }
    /**
     * Resolves a tag, matching handles to those defined in %TAG directives.
     *
     * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
     *   `'!local'` tag, or `null` if unresolvable.
     */
    tagName(source, onError) {
        if (source === '!')
            return '!'; // non-specific tag
        if (source[0] !== '!') {
            onError(`Not a valid tag: ${source}`);
            return null;
        }
        if (source[1] === '<') {
            const verbatim = source.slice(2, -1);
            if (verbatim === '!' || verbatim === '!!') {
                onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
                return null;
            }
            if (source[source.length - 1] !== '>')
                onError('Verbatim tags must end with a >');
            return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
            onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
            try {
                return prefix + decodeURIComponent(suffix);
            }
            catch (error) {
                onError(String(error));
                return null;
            }
        }
        if (handle === '!')
            return source; // local tag
        onError(`Could not resolve tag: ${source}`);
        return null;
    }
    /**
     * Given a fully resolved tag, returns its printable string form,
     * taking into account current tag prefixes and defaults.
     */
    tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
            if (tag.startsWith(prefix))
                return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === '!' ? tag : `!<${tag}>`;
    }
    toString(doc) {
        const lines = this.yaml.explicit
            ? [`%YAML ${this.yaml.version || '1.2'}`]
            : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
            const tags = {};
            visit.visit(doc.contents, (_key, node) => {
                if (identity.isNode(node) && node.tag)
                    tags[node.tag] = true;
            });
            tagNames = Object.keys(tags);
        }
        else
            tagNames = [];
        for (const [handle, prefix] of tagEntries) {
            if (handle === '!!' && prefix === 'tag:yaml.org,2002:')
                continue;
            if (!doc || tagNames.some(tn => tn.startsWith(prefix)))
                lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join('\n');
    }
}
Directives.defaultYaml = { explicit: false, version: '1.2' };
Directives.defaultTags = { '!!': 'tag:yaml.org,2002:' };

exports.Directives = Directives;


/***/ }),

/***/ 1269:
/***/ ((__unused_webpack_module, exports) => {



class YAMLError extends Error {
    constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
    }
}
class YAMLParseError extends YAMLError {
    constructor(pos, code, message) {
        super('YAMLParseError', pos, code, message);
    }
}
class YAMLWarning extends YAMLError {
    constructor(pos, code, message) {
        super('YAMLWarning', pos, code, message);
    }
}
const prettifyError = (src, lc) => (error) => {
    if (error.pos[0] === -1)
        return;
    error.linePos = error.pos.map(pos => lc.linePos(pos));
    const { line, col } = error.linePos[0];
    error.message += ` at line ${line}, column ${col}`;
    let ci = col - 1;
    let lineStr = src
        .substring(lc.lineStarts[line - 1], lc.lineStarts[line])
        .replace(/[\n\r]+$/, '');
    // Trim to max 80 chars, keeping col position near the middle
    if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = '…' + lineStr.substring(trimStart);
        ci -= trimStart - 1;
    }
    if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + '…';
    // Include previous line in context if pointing at line start
    if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        // Regexp won't match if start is trimmed
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
            prev = prev.substring(0, 79) + '…\n';
        lineStr = prev + lineStr;
    }
    if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
            count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = ' '.repeat(ci) + '^'.repeat(count);
        error.message += `:\n\n${lineStr}\n${pointer}\n`;
    }
};

exports.YAMLError = YAMLError;
exports.YAMLParseError = YAMLParseError;
exports.YAMLWarning = YAMLWarning;
exports.prettifyError = prettifyError;


/***/ }),

/***/ 7620:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

var __webpack_unused_export__;


var composer = __nccwpck_require__(9261);
var Document = __nccwpck_require__(5244);
var Schema = __nccwpck_require__(3015);
var errors = __nccwpck_require__(1269);
var Alias = __nccwpck_require__(7798);
var identity = __nccwpck_require__(3662);
var Pair = __nccwpck_require__(7664);
var Scalar = __nccwpck_require__(8732);
var YAMLMap = __nccwpck_require__(2613);
var YAMLSeq = __nccwpck_require__(3584);
var cst = __nccwpck_require__(8454);
var lexer = __nccwpck_require__(10);
var lineCounter = __nccwpck_require__(7953);
var parser = __nccwpck_require__(7221);
var publicApi = __nccwpck_require__(1282);
var visit = __nccwpck_require__(2727);



__webpack_unused_export__ = composer.Composer;
__webpack_unused_export__ = Document.Document;
__webpack_unused_export__ = Schema.Schema;
__webpack_unused_export__ = errors.YAMLError;
exports.XT = errors.YAMLParseError;
__webpack_unused_export__ = errors.YAMLWarning;
__webpack_unused_export__ = Alias.Alias;
__webpack_unused_export__ = identity.isAlias;
__webpack_unused_export__ = identity.isCollection;
__webpack_unused_export__ = identity.isDocument;
__webpack_unused_export__ = identity.isMap;
__webpack_unused_export__ = identity.isNode;
__webpack_unused_export__ = identity.isPair;
__webpack_unused_export__ = identity.isScalar;
__webpack_unused_export__ = identity.isSeq;
__webpack_unused_export__ = Pair.Pair;
__webpack_unused_export__ = Scalar.Scalar;
__webpack_unused_export__ = YAMLMap.YAMLMap;
__webpack_unused_export__ = YAMLSeq.YAMLSeq;
__webpack_unused_export__ = cst;
__webpack_unused_export__ = lexer.Lexer;
__webpack_unused_export__ = lineCounter.LineCounter;
__webpack_unused_export__ = parser.Parser;
exports.qg = publicApi.parse;
__webpack_unused_export__ = publicApi.parseAllDocuments;
__webpack_unused_export__ = publicApi.parseDocument;
__webpack_unused_export__ = publicApi.stringify;
__webpack_unused_export__ = visit.visit;
__webpack_unused_export__ = visit.visitAsync;


/***/ }),

/***/ 9982:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var node_process = __nccwpck_require__(932);

function debug(logLevel, ...messages) {
    if (logLevel === 'debug')
        console.log(...messages);
}
function warn(logLevel, warning) {
    if (logLevel === 'debug' || logLevel === 'warn') {
        if (typeof node_process.emitWarning === 'function')
            node_process.emitWarning(warning);
        else
            console.warn(warning);
    }
}

exports.debug = debug;
exports.warn = warn;


/***/ }),

/***/ 7798:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var anchors = __nccwpck_require__(7407);
var visit = __nccwpck_require__(2727);
var identity = __nccwpck_require__(3662);
var Node = __nccwpck_require__(2144);
var toJS = __nccwpck_require__(2150);

class Alias extends Node.NodeBase {
    constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, 'tag', {
            set() {
                throw new Error('Alias nodes cannot have tags');
            }
        });
    }
    /**
     * Resolve the value of this alias within `doc`, finding the last
     * instance of the `source` anchor before this node.
     */
    resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
            throw new ReferenceError('Alias resolution is disabled');
        let nodes;
        if (ctx?.aliasResolveCache) {
            nodes = ctx.aliasResolveCache;
        }
        else {
            nodes = [];
            visit.visit(doc, {
                Node: (_key, node) => {
                    if (identity.isAlias(node) || identity.hasAnchor(node))
                        nodes.push(node);
                }
            });
            if (ctx)
                ctx.aliasResolveCache = nodes;
        }
        let found = undefined;
        for (const node of nodes) {
            if (node === this)
                break;
            if (node.anchor === this.source)
                found = node;
        }
        return found;
    }
    toJSON(_arg, ctx) {
        if (!ctx)
            return { source: this.source };
        const { anchors, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new ReferenceError(msg);
        }
        let data = anchors.get(source);
        if (!data) {
            // Resolve anchors for Node.prototype.toJS()
            toJS.toJS(source, null, ctx);
            data = anchors.get(source);
        }
        /* istanbul ignore if */
        if (data?.res === undefined) {
            const msg = 'This should not happen: Alias anchor was not resolved?';
            throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
                data.aliasCount = getAliasCount(doc, source, anchors);
            if (data.count * data.aliasCount > maxAliasCount) {
                const msg = 'Excessive alias count indicates a resource exhaustion attack';
                throw new ReferenceError(msg);
            }
        }
        return data.res;
    }
    toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
            anchors.anchorIsValid(this.source);
            if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
                const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
                throw new Error(msg);
            }
            if (ctx.implicitKey)
                return `${src} `;
        }
        return src;
    }
}
function getAliasCount(doc, node, anchors) {
    if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors && source && anchors.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
    }
    else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
            const c = getAliasCount(doc, item, anchors);
            if (c > count)
                count = c;
        }
        return count;
    }
    else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors);
        const vc = getAliasCount(doc, node.value, anchors);
        return Math.max(kc, vc);
    }
    return 1;
}

exports.Alias = Alias;


/***/ }),

/***/ 7616:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var createNode = __nccwpck_require__(6581);
var identity = __nccwpck_require__(3662);
var Node = __nccwpck_require__(2144);

function collectionFromPath(schema, path, value) {
    let v = value;
    for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === 'number' && Number.isInteger(k) && k >= 0) {
            const a = [];
            a[k] = v;
            v = a;
        }
        else {
            v = new Map([[k, v]]);
        }
    }
    return createNode.createNode(v, undefined, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
            throw new Error('This should not happen, please report a bug.');
        },
        schema,
        sourceObjects: new Map()
    });
}
// Type guard is intentionally a little wrong so as to be more useful,
// as it does not cover untypable empty non-string iterables (e.g. []).
const isEmptyPath = (path) => path == null ||
    (typeof path === 'object' && !!path[Symbol.iterator]().next().done);
class Collection extends Node.NodeBase {
    constructor(type, schema) {
        super(type);
        Object.defineProperty(this, 'schema', {
            value: schema,
            configurable: true,
            enumerable: false,
            writable: true
        });
    }
    /**
     * Create a copy of this collection.
     *
     * @param schema - If defined, overwrites the original's schema
     */
    clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
            copy.schema = schema;
        copy.items = copy.items.map(it => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
            copy.range = this.range.slice();
        return copy;
    }
    /**
     * Adds a value to the collection. For `!!map` and `!!omap` the value must
     * be a Pair instance or a `{ key, value }` object, which may not have a key
     * that already exists in the map.
     */
    addIn(path, value) {
        if (isEmptyPath(path))
            this.add(value);
        else {
            const [key, ...rest] = path;
            const node = this.get(key, true);
            if (identity.isCollection(node))
                node.addIn(rest, value);
            else if (node === undefined && this.schema)
                this.set(key, collectionFromPath(this.schema, rest, value));
            else
                throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
    }
    /**
     * Removes a value from the collection.
     * @returns `true` if the item was found and removed.
     */
    deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
            return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
            return node.deleteIn(rest);
        else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
    /**
     * Returns item at `key`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
            return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
            return identity.isCollection(node) ? node.getIn(rest, keepScalar) : undefined;
    }
    hasAllNullValues(allowScalar) {
        return this.items.every(node => {
            if (!identity.isPair(node))
                return false;
            const n = node.value;
            return (n == null ||
                (allowScalar &&
                    identity.isScalar(n) &&
                    n.value == null &&
                    !n.commentBefore &&
                    !n.comment &&
                    !n.tag));
        });
    }
    /**
     * Checks if the collection includes a value with the key `key`.
     */
    hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
            return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
    }
    /**
     * Sets a value in this collection. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
            this.set(key, value);
        }
        else {
            const node = this.get(key, true);
            if (identity.isCollection(node))
                node.setIn(rest, value);
            else if (node === undefined && this.schema)
                this.set(key, collectionFromPath(this.schema, rest, value));
            else
                throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
    }
}

exports.Collection = Collection;
exports.collectionFromPath = collectionFromPath;
exports.isEmptyPath = isEmptyPath;


/***/ }),

/***/ 2144:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var applyReviver = __nccwpck_require__(3660);
var identity = __nccwpck_require__(3662);
var toJS = __nccwpck_require__(2150);

class NodeBase {
    constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
    }
    /** Create a copy of this node.  */
    clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
            copy.range = this.range.slice();
        return copy;
    }
    /** A plain JavaScript representation of this node. */
    toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
            throw new TypeError('A document argument is required');
        const ctx = {
            anchors: new Map(),
            doc,
            keep: true,
            mapAsMap: mapAsMap === true,
            mapKeyWarned: false,
            maxAliasCount: typeof maxAliasCount === 'number' ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, '', ctx);
        if (typeof onAnchor === 'function')
            for (const { count, res } of ctx.anchors.values())
                onAnchor(res, count);
        return typeof reviver === 'function'
            ? applyReviver.applyReviver(reviver, { '': res }, '', res)
            : res;
    }
}

exports.NodeBase = NodeBase;


/***/ }),

/***/ 7664:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var createNode = __nccwpck_require__(6581);
var stringifyPair = __nccwpck_require__(2043);
var addPairToJSMap = __nccwpck_require__(5585);
var identity = __nccwpck_require__(3662);

function createPair(key, value, ctx) {
    const k = createNode.createNode(key, undefined, ctx);
    const v = createNode.createNode(value, undefined, ctx);
    return new Pair(k, v);
}
class Pair {
    constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
    }
    clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
            key = key.clone(schema);
        if (identity.isNode(value))
            value = value.clone(schema);
        return new Pair(key, value);
    }
    toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
    }
    toString(ctx, onComment, onChompKeep) {
        return ctx?.doc
            ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep)
            : JSON.stringify(this);
    }
}

exports.Pair = Pair;
exports.createPair = createPair;


/***/ }),

/***/ 8732:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var Node = __nccwpck_require__(2144);
var toJS = __nccwpck_require__(2150);

const isScalarValue = (value) => !value || (typeof value !== 'function' && typeof value !== 'object');
class Scalar extends Node.NodeBase {
    constructor(value) {
        super(identity.SCALAR);
        this.value = value;
    }
    toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
    }
    toString() {
        return String(this.value);
    }
}
Scalar.BLOCK_FOLDED = 'BLOCK_FOLDED';
Scalar.BLOCK_LITERAL = 'BLOCK_LITERAL';
Scalar.PLAIN = 'PLAIN';
Scalar.QUOTE_DOUBLE = 'QUOTE_DOUBLE';
Scalar.QUOTE_SINGLE = 'QUOTE_SINGLE';

exports.Scalar = Scalar;
exports.isScalarValue = isScalarValue;


/***/ }),

/***/ 2613:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyCollection = __nccwpck_require__(3803);
var addPairToJSMap = __nccwpck_require__(5585);
var Collection = __nccwpck_require__(7616);
var identity = __nccwpck_require__(3662);
var Pair = __nccwpck_require__(7664);
var Scalar = __nccwpck_require__(8732);

function findPair(items, key) {
    const k = identity.isScalar(key) ? key.value : key;
    for (const it of items) {
        if (identity.isPair(it)) {
            if (it.key === key || it.key === k)
                return it;
            if (identity.isScalar(it.key) && it.key.value === k)
                return it;
        }
    }
    return undefined;
}
class YAMLMap extends Collection.Collection {
    static get tagName() {
        return 'tag:yaml.org,2002:map';
    }
    constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
    }
    /**
     * A generic collection parsing method that can be extended
     * to other node classes that inherit from YAMLMap
     */
    static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
            if (typeof replacer === 'function')
                value = replacer.call(obj, key, value);
            else if (Array.isArray(replacer) && !replacer.includes(key))
                return;
            if (value !== undefined || keepUndefined)
                map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
            for (const [key, value] of obj)
                add(key, value);
        }
        else if (obj && typeof obj === 'object') {
            for (const key of Object.keys(obj))
                add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === 'function') {
            map.items.sort(schema.sortMapEntries);
        }
        return map;
    }
    /**
     * Adds a value to the collection.
     *
     * @param overwrite - If not set `true`, using a key that is already in the
     *   collection will throw. Otherwise, overwrites the previous value.
     */
    add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
            _pair = pair;
        else if (!pair || typeof pair !== 'object' || !('key' in pair)) {
            // In TypeScript, this never happens.
            _pair = new Pair.Pair(pair, pair?.value);
        }
        else
            _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
            if (!overwrite)
                throw new Error(`Key ${_pair.key} already set`);
            // For scalars, keep the old node & its comments and anchors
            if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
                prev.value.value = _pair.value;
            else
                prev.value = _pair.value;
        }
        else if (sortEntries) {
            const i = this.items.findIndex(item => sortEntries(_pair, item) < 0);
            if (i === -1)
                this.items.push(_pair);
            else
                this.items.splice(i, 0, _pair);
        }
        else {
            this.items.push(_pair);
        }
    }
    delete(key) {
        const it = findPair(this.items, key);
        if (!it)
            return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
    }
    get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? undefined;
    }
    has(key) {
        return !!findPair(this.items, key);
    }
    set(key, value) {
        this.add(new Pair.Pair(key, value), true);
    }
    /**
     * @param ctx - Conversion context, originally set in Document#toJS()
     * @param {Class} Type - If set, forces the returned collection type
     * @returns Instance of Type, Map, or Object
     */
    toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? new Map() : {};
        if (ctx?.onCreate)
            ctx.onCreate(map);
        for (const item of this.items)
            addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
    }
    toString(ctx, onComment, onChompKeep) {
        if (!ctx)
            return JSON.stringify(this);
        for (const item of this.items) {
            if (!identity.isPair(item))
                throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
            ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
            blockItemPrefix: '',
            flowChars: { start: '{', end: '}' },
            itemIndent: ctx.indent || '',
            onChompKeep,
            onComment
        });
    }
}

exports.YAMLMap = YAMLMap;
exports.findPair = findPair;


/***/ }),

/***/ 3584:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var createNode = __nccwpck_require__(6581);
var stringifyCollection = __nccwpck_require__(3803);
var Collection = __nccwpck_require__(7616);
var identity = __nccwpck_require__(3662);
var Scalar = __nccwpck_require__(8732);
var toJS = __nccwpck_require__(2150);

class YAMLSeq extends Collection.Collection {
    static get tagName() {
        return 'tag:yaml.org,2002:seq';
    }
    constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
    }
    add(value) {
        this.items.push(value);
    }
    /**
     * Removes a value from the collection.
     *
     * `key` must contain a representation of an integer for this to succeed.
     * It may be wrapped in a `Scalar`.
     *
     * @returns `true` if the item was found and removed.
     */
    delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number')
            return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
    }
    get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number')
            return undefined;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
    }
    /**
     * Checks if the collection includes a value with the key `key`.
     *
     * `key` must contain a representation of an integer for this to succeed.
     * It may be wrapped in a `Scalar`.
     */
    has(key) {
        const idx = asItemIndex(key);
        return typeof idx === 'number' && idx < this.items.length;
    }
    /**
     * Sets a value in this collection. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     *
     * If `key` does not contain a representation of an integer, this will throw.
     * It may be wrapped in a `Scalar`.
     */
    set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number')
            throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
            prev.value = value;
        else
            this.items[idx] = value;
    }
    toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
            ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
            seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
    }
    toString(ctx, onComment, onChompKeep) {
        if (!ctx)
            return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
            blockItemPrefix: '- ',
            flowChars: { start: '[', end: ']' },
            itemIndent: (ctx.indent || '') + '  ',
            onChompKeep,
            onComment
        });
    }
    static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
            let i = 0;
            for (let it of obj) {
                if (typeof replacer === 'function') {
                    const key = obj instanceof Set ? it : String(i++);
                    it = replacer.call(obj, key, it);
                }
                seq.items.push(createNode.createNode(it, undefined, ctx));
            }
        }
        return seq;
    }
}
function asItemIndex(key) {
    let idx = identity.isScalar(key) ? key.value : key;
    if (idx && typeof idx === 'string')
        idx = Number(idx);
    return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0
        ? idx
        : null;
}

exports.YAMLSeq = YAMLSeq;


/***/ }),

/***/ 5585:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var log = __nccwpck_require__(9982);
var merge = __nccwpck_require__(4067);
var stringify = __nccwpck_require__(7727);
var identity = __nccwpck_require__(3662);
var toJS = __nccwpck_require__(2150);

function addPairToJSMap(ctx, map, { key, value }) {
    if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
    // TODO: Should drop this special case for bare << handling
    else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
    else {
        const jsKey = toJS.toJS(key, '', ctx);
        if (map instanceof Map) {
            map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        }
        else if (map instanceof Set) {
            map.add(jsKey);
        }
        else {
            const stringKey = stringifyKey(key, jsKey, ctx);
            const jsValue = toJS.toJS(value, stringKey, ctx);
            if (stringKey in map)
                Object.defineProperty(map, stringKey, {
                    value: jsValue,
                    writable: true,
                    enumerable: true,
                    configurable: true
                });
            else
                map[stringKey] = jsValue;
        }
    }
    return map;
}
function stringifyKey(key, jsKey, ctx) {
    if (jsKey === null)
        return '';
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    if (typeof jsKey !== 'object')
        return String(jsKey);
    if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = new Set();
        for (const node of ctx.anchors.keys())
            strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
            let jsonStr = JSON.stringify(strKey);
            if (jsonStr.length > 40)
                jsonStr = jsonStr.substring(0, 36) + '..."';
            log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
            ctx.mapKeyWarned = true;
        }
        return strKey;
    }
    return JSON.stringify(jsKey);
}

exports.addPairToJSMap = addPairToJSMap;


/***/ }),

/***/ 3662:
/***/ ((__unused_webpack_module, exports) => {



const ALIAS = Symbol.for('yaml.alias');
const DOC = Symbol.for('yaml.document');
const MAP = Symbol.for('yaml.map');
const PAIR = Symbol.for('yaml.pair');
const SCALAR = Symbol.for('yaml.scalar');
const SEQ = Symbol.for('yaml.seq');
const NODE_TYPE = Symbol.for('yaml.node.type');
const isAlias = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === ALIAS;
const isDocument = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === DOC;
const isMap = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === MAP;
const isPair = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === PAIR;
const isScalar = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === SCALAR;
const isSeq = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === SEQ;
function isCollection(node) {
    if (node && typeof node === 'object')
        switch (node[NODE_TYPE]) {
            case MAP:
            case SEQ:
                return true;
        }
    return false;
}
function isNode(node) {
    if (node && typeof node === 'object')
        switch (node[NODE_TYPE]) {
            case ALIAS:
            case MAP:
            case SCALAR:
            case SEQ:
                return true;
        }
    return false;
}
const hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;

exports.ALIAS = ALIAS;
exports.DOC = DOC;
exports.MAP = MAP;
exports.NODE_TYPE = NODE_TYPE;
exports.PAIR = PAIR;
exports.SCALAR = SCALAR;
exports.SEQ = SEQ;
exports.hasAnchor = hasAnchor;
exports.isAlias = isAlias;
exports.isCollection = isCollection;
exports.isDocument = isDocument;
exports.isMap = isMap;
exports.isNode = isNode;
exports.isPair = isPair;
exports.isScalar = isScalar;
exports.isSeq = isSeq;


/***/ }),

/***/ 2150:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);

/**
 * Recursively convert any node or its contents to native JavaScript
 *
 * @param value - The input value
 * @param arg - If `value` defines a `toJSON()` method, use this
 *   as its first argument
 * @param ctx - Conversion context, originally set in Document#toJS(). If
 *   `{ keep: true }` is not set, output should be suitable for JSON
 *   stringification.
 */
function toJS(value, arg, ctx) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
    if (value && typeof value.toJSON === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        if (!ctx || !identity.hasAnchor(value))
            return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: undefined };
        ctx.anchors.set(value, data);
        ctx.onCreate = res => {
            data.res = res;
            delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
            ctx.onCreate(res);
        return res;
    }
    if (typeof value === 'bigint' && !ctx?.keep)
        return Number(value);
    return value;
}

exports.toJS = toJS;


/***/ }),

/***/ 3699:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var resolveBlockScalar = __nccwpck_require__(1788);
var resolveFlowScalar = __nccwpck_require__(4513);
var errors = __nccwpck_require__(1269);
var stringifyString = __nccwpck_require__(5098);

function resolveAsScalar(token, strict = true, onError) {
    if (token) {
        const _onError = (pos, code, message) => {
            const offset = typeof pos === 'number' ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
            if (onError)
                onError(offset, code, message);
            else
                throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
            case 'scalar':
            case 'single-quoted-scalar':
            case 'double-quoted-scalar':
                return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
            case 'block-scalar':
                return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
    }
    return null;
}
/**
 * Create a new scalar token with `value`
 *
 * Values that represent an actual string but may be parsed as a different type should use a `type` other than `'PLAIN'`,
 * as this function does not support any schema operations and won't check for such conflicts.
 *
 * @param value The string representation of the value, which will have its content properly indented.
 * @param context.end Comments and whitespace after the end of the value, or after the block scalar header. If undefined, a newline will be added.
 * @param context.implicitKey Being within an implicit key may affect the resolved type of the token's value.
 * @param context.indent The indent level of the token.
 * @param context.inFlow Is this scalar within a flow collection? This may affect the resolved type of the token's value.
 * @param context.offset The offset position of the token.
 * @param context.type The preferred type of the scalar token. If undefined, the previous type of the `token` will be used, defaulting to `'PLAIN'`.
 */
function createScalarToken(value, context) {
    const { implicitKey = false, indent, inFlow = false, offset = -1, type = 'PLAIN' } = context;
    const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? ' '.repeat(indent) : '',
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
    });
    const end = context.end ?? [
        { type: 'newline', offset: -1, indent, source: '\n' }
    ];
    switch (source[0]) {
        case '|':
        case '>': {
            const he = source.indexOf('\n');
            const head = source.substring(0, he);
            const body = source.substring(he + 1) + '\n';
            const props = [
                { type: 'block-scalar-header', offset, indent, source: head }
            ];
            if (!addEndtoBlockProps(props, end))
                props.push({ type: 'newline', offset: -1, indent, source: '\n' });
            return { type: 'block-scalar', offset, indent, props, source: body };
        }
        case '"':
            return { type: 'double-quoted-scalar', offset, indent, source, end };
        case "'":
            return { type: 'single-quoted-scalar', offset, indent, source, end };
        default:
            return { type: 'scalar', offset, indent, source, end };
    }
}
/**
 * Set the value of `token` to the given string `value`, overwriting any previous contents and type that it may have.
 *
 * Best efforts are made to retain any comments previously associated with the `token`,
 * though all contents within a collection's `items` will be overwritten.
 *
 * Values that represent an actual string but may be parsed as a different type should use a `type` other than `'PLAIN'`,
 * as this function does not support any schema operations and won't check for such conflicts.
 *
 * @param token Any token. If it does not include an `indent` value, the value will be stringified as if it were an implicit key.
 * @param value The string representation of the value, which will have its content properly indented.
 * @param context.afterKey In most cases, values after a key should have an additional level of indentation.
 * @param context.implicitKey Being within an implicit key may affect the resolved type of the token's value.
 * @param context.inFlow Being within a flow collection may affect the resolved type of the token's value.
 * @param context.type The preferred type of the scalar token. If undefined, the previous type of the `token` will be used, defaulting to `'PLAIN'`.
 */
function setScalarValue(token, value, context = {}) {
    let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
    let indent = 'indent' in token ? token.indent : null;
    if (afterKey && typeof indent === 'number')
        indent += 2;
    if (!type)
        switch (token.type) {
            case 'single-quoted-scalar':
                type = 'QUOTE_SINGLE';
                break;
            case 'double-quoted-scalar':
                type = 'QUOTE_DOUBLE';
                break;
            case 'block-scalar': {
                const header = token.props[0];
                if (header.type !== 'block-scalar-header')
                    throw new Error('Invalid block scalar header');
                type = header.source[0] === '>' ? 'BLOCK_FOLDED' : 'BLOCK_LITERAL';
                break;
            }
            default:
                type = 'PLAIN';
        }
    const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? ' '.repeat(indent) : '',
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
    });
    switch (source[0]) {
        case '|':
        case '>':
            setBlockScalarValue(token, source);
            break;
        case '"':
            setFlowScalarValue(token, source, 'double-quoted-scalar');
            break;
        case "'":
            setFlowScalarValue(token, source, 'single-quoted-scalar');
            break;
        default:
            setFlowScalarValue(token, source, 'scalar');
    }
}
function setBlockScalarValue(token, source) {
    const he = source.indexOf('\n');
    const head = source.substring(0, he);
    const body = source.substring(he + 1) + '\n';
    if (token.type === 'block-scalar') {
        const header = token.props[0];
        if (header.type !== 'block-scalar-header')
            throw new Error('Invalid block scalar header');
        header.source = head;
        token.source = body;
    }
    else {
        const { offset } = token;
        const indent = 'indent' in token ? token.indent : -1;
        const props = [
            { type: 'block-scalar-header', offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, 'end' in token ? token.end : undefined))
            props.push({ type: 'newline', offset: -1, indent, source: '\n' });
        for (const key of Object.keys(token))
            if (key !== 'type' && key !== 'offset')
                delete token[key];
        Object.assign(token, { type: 'block-scalar', indent, props, source: body });
    }
}
/** @returns `true` if last token is a newline */
function addEndtoBlockProps(props, end) {
    if (end)
        for (const st of end)
            switch (st.type) {
                case 'space':
                case 'comment':
                    props.push(st);
                    break;
                case 'newline':
                    props.push(st);
                    return true;
            }
    return false;
}
function setFlowScalarValue(token, source, type) {
    switch (token.type) {
        case 'scalar':
        case 'double-quoted-scalar':
        case 'single-quoted-scalar':
            token.type = type;
            token.source = source;
            break;
        case 'block-scalar': {
            const end = token.props.slice(1);
            let oa = source.length;
            if (token.props[0].type === 'block-scalar-header')
                oa -= token.props[0].source.length;
            for (const tok of end)
                tok.offset += oa;
            delete token.props;
            Object.assign(token, { type, source, end });
            break;
        }
        case 'block-map':
        case 'block-seq': {
            const offset = token.offset + source.length;
            const nl = { type: 'newline', offset, indent: token.indent, source: '\n' };
            delete token.items;
            Object.assign(token, { type, source, end: [nl] });
            break;
        }
        default: {
            const indent = 'indent' in token ? token.indent : -1;
            const end = 'end' in token && Array.isArray(token.end)
                ? token.end.filter(st => st.type === 'space' ||
                    st.type === 'comment' ||
                    st.type === 'newline')
                : [];
            for (const key of Object.keys(token))
                if (key !== 'type' && key !== 'offset')
                    delete token[key];
            Object.assign(token, { type, indent, source, end });
        }
    }
}

exports.createScalarToken = createScalarToken;
exports.resolveAsScalar = resolveAsScalar;
exports.setScalarValue = setScalarValue;


/***/ }),

/***/ 3066:
/***/ ((__unused_webpack_module, exports) => {



/**
 * Stringify a CST document, token, or collection item
 *
 * Fair warning: This applies no validation whatsoever, and
 * simply concatenates the sources in their logical order.
 */
const stringify = (cst) => 'type' in cst ? stringifyToken(cst) : stringifyItem(cst);
function stringifyToken(token) {
    switch (token.type) {
        case 'block-scalar': {
            let res = '';
            for (const tok of token.props)
                res += stringifyToken(tok);
            return res + token.source;
        }
        case 'block-map':
        case 'block-seq': {
            let res = '';
            for (const item of token.items)
                res += stringifyItem(item);
            return res;
        }
        case 'flow-collection': {
            let res = token.start.source;
            for (const item of token.items)
                res += stringifyItem(item);
            for (const st of token.end)
                res += st.source;
            return res;
        }
        case 'document': {
            let res = stringifyItem(token);
            if (token.end)
                for (const st of token.end)
                    res += st.source;
            return res;
        }
        default: {
            let res = token.source;
            if ('end' in token && token.end)
                for (const st of token.end)
                    res += st.source;
            return res;
        }
    }
}
function stringifyItem({ start, key, sep, value }) {
    let res = '';
    for (const st of start)
        res += st.source;
    if (key)
        res += stringifyToken(key);
    if (sep)
        for (const st of sep)
            res += st.source;
    if (value)
        res += stringifyToken(value);
    return res;
}

exports.stringify = stringify;


/***/ }),

/***/ 9856:
/***/ ((__unused_webpack_module, exports) => {



const BREAK = Symbol('break visit');
const SKIP = Symbol('skip children');
const REMOVE = Symbol('remove item');
/**
 * Apply a visitor to a CST document or item.
 *
 * Walks through the tree (depth-first) starting from the root, calling a
 * `visitor` function with two arguments when entering each item:
 *   - `item`: The current item, which included the following members:
 *     - `start: SourceToken[]` – Source tokens before the key or value,
 *       possibly including its anchor or tag.
 *     - `key?: Token | null` – Set for pair values. May then be `null`, if
 *       the key before the `:` separator is empty.
 *     - `sep?: SourceToken[]` – Source tokens between the key and the value,
 *       which should include the `:` map value indicator if `value` is set.
 *     - `value?: Token` – The value of a sequence item, or of a map pair.
 *   - `path`: The steps from the root to the current node, as an array of
 *     `['key' | 'value', number]` tuples.
 *
 * The return value of the visitor may be used to control the traversal:
 *   - `undefined` (default): Do nothing and continue
 *   - `visit.SKIP`: Do not visit the children of this token, continue with
 *      next sibling
 *   - `visit.BREAK`: Terminate traversal completely
 *   - `visit.REMOVE`: Remove the current item, then continue with the next one
 *   - `number`: Set the index of the next step. This is useful especially if
 *     the index of the current token has changed.
 *   - `function`: Define the next visitor for this item. After the original
 *     visitor is called on item entry, next visitors are called after handling
 *     a non-empty `key` and when exiting the item.
 */
function visit(cst, visitor) {
    if ('type' in cst && cst.type === 'document')
        cst = { start: cst.start, value: cst.value };
    _visit(Object.freeze([]), cst, visitor);
}
// Without the `as symbol` casts, TS declares these in the `visit`
// namespace using `var`, but then complains about that because
// `unique symbol` must be `const`.
/** Terminate visit traversal completely */
visit.BREAK = BREAK;
/** Do not visit the children of the current item */
visit.SKIP = SKIP;
/** Remove the current item */
visit.REMOVE = REMOVE;
/** Find the item at `path` from `cst` as the root */
visit.itemAtPath = (cst, path) => {
    let item = cst;
    for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && 'items' in tok) {
            item = tok.items[index];
        }
        else
            return undefined;
    }
    return item;
};
/**
 * Get the immediate parent collection of the item at `path` from `cst` as the root.
 *
 * Throws an error if the collection is not found, which should never happen if the item itself exists.
 */
visit.parentCollection = (cst, path) => {
    const parent = visit.itemAtPath(cst, path.slice(0, -1));
    const field = path[path.length - 1][0];
    const coll = parent?.[field];
    if (coll && 'items' in coll)
        return coll;
    throw new Error('Parent collection not found');
};
function _visit(path, item, visitor) {
    let ctrl = visitor(item, path);
    if (typeof ctrl === 'symbol')
        return ctrl;
    for (const field of ['key', 'value']) {
        const token = item[field];
        if (token && 'items' in token) {
            for (let i = 0; i < token.items.length; ++i) {
                const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
                if (typeof ci === 'number')
                    i = ci - 1;
                else if (ci === BREAK)
                    return BREAK;
                else if (ci === REMOVE) {
                    token.items.splice(i, 1);
                    i -= 1;
                }
            }
            if (typeof ctrl === 'function' && field === 'key')
                ctrl = ctrl(item, path);
        }
    }
    return typeof ctrl === 'function' ? ctrl(item, path) : ctrl;
}

exports.visit = visit;


/***/ }),

/***/ 8454:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var cstScalar = __nccwpck_require__(3699);
var cstStringify = __nccwpck_require__(3066);
var cstVisit = __nccwpck_require__(9856);

/** The byte order mark */
const BOM = '\u{FEFF}';
/** Start of doc-mode */
const DOCUMENT = '\x02'; // C0: Start of Text
/** Unexpected end of flow-mode */
const FLOW_END = '\x18'; // C0: Cancel
/** Next token is a scalar value */
const SCALAR = '\x1f'; // C0: Unit Separator
/** @returns `true` if `token` is a flow or block collection */
const isCollection = (token) => !!token && 'items' in token;
/** @returns `true` if `token` is a flow or block scalar; not an alias */
const isScalar = (token) => !!token &&
    (token.type === 'scalar' ||
        token.type === 'single-quoted-scalar' ||
        token.type === 'double-quoted-scalar' ||
        token.type === 'block-scalar');
/* istanbul ignore next */
/** Get a printable representation of a lexer token */
function prettyToken(token) {
    switch (token) {
        case BOM:
            return '<BOM>';
        case DOCUMENT:
            return '<DOC>';
        case FLOW_END:
            return '<FLOW_END>';
        case SCALAR:
            return '<SCALAR>';
        default:
            return JSON.stringify(token);
    }
}
/** Identify the type of a lexer token. May return `null` for unknown tokens. */
function tokenType(source) {
    switch (source) {
        case BOM:
            return 'byte-order-mark';
        case DOCUMENT:
            return 'doc-mode';
        case FLOW_END:
            return 'flow-error-end';
        case SCALAR:
            return 'scalar';
        case '---':
            return 'doc-start';
        case '...':
            return 'doc-end';
        case '':
        case '\n':
        case '\r\n':
            return 'newline';
        case '-':
            return 'seq-item-ind';
        case '?':
            return 'explicit-key-ind';
        case ':':
            return 'map-value-ind';
        case '{':
            return 'flow-map-start';
        case '}':
            return 'flow-map-end';
        case '[':
            return 'flow-seq-start';
        case ']':
            return 'flow-seq-end';
        case ',':
            return 'comma';
    }
    switch (source[0]) {
        case ' ':
        case '\t':
            return 'space';
        case '#':
            return 'comment';
        case '%':
            return 'directive-line';
        case '*':
            return 'alias';
        case '&':
            return 'anchor';
        case '!':
            return 'tag';
        case "'":
            return 'single-quoted-scalar';
        case '"':
            return 'double-quoted-scalar';
        case '|':
        case '>':
            return 'block-scalar-header';
    }
    return null;
}

exports.createScalarToken = cstScalar.createScalarToken;
exports.resolveAsScalar = cstScalar.resolveAsScalar;
exports.setScalarValue = cstScalar.setScalarValue;
exports.stringify = cstStringify.stringify;
exports.visit = cstVisit.visit;
exports.BOM = BOM;
exports.DOCUMENT = DOCUMENT;
exports.FLOW_END = FLOW_END;
exports.SCALAR = SCALAR;
exports.isCollection = isCollection;
exports.isScalar = isScalar;
exports.prettyToken = prettyToken;
exports.tokenType = tokenType;


/***/ }),

/***/ 10:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var cst = __nccwpck_require__(8454);

/*
START -> stream

stream
  directive -> line-end -> stream
  indent + line-end -> stream
  [else] -> line-start

line-end
  comment -> line-end
  newline -> .
  input-end -> END

line-start
  doc-start -> doc
  doc-end -> stream
  [else] -> indent -> block-start

block-start
  seq-item-start -> block-start
  explicit-key-start -> block-start
  map-value-start -> block-start
  [else] -> doc

doc
  line-end -> line-start
  spaces -> doc
  anchor -> doc
  tag -> doc
  flow-start -> flow -> doc
  flow-end -> error -> doc
  seq-item-start -> error -> doc
  explicit-key-start -> error -> doc
  map-value-start -> doc
  alias -> doc
  quote-start -> quoted-scalar -> doc
  block-scalar-header -> line-end -> block-scalar(min) -> line-start
  [else] -> plain-scalar(false, min) -> doc

flow
  line-end -> flow
  spaces -> flow
  anchor -> flow
  tag -> flow
  flow-start -> flow -> flow
  flow-end -> .
  seq-item-start -> error -> flow
  explicit-key-start -> flow
  map-value-start -> flow
  alias -> flow
  quote-start -> quoted-scalar -> flow
  comma -> flow
  [else] -> plain-scalar(true, 0) -> flow

quoted-scalar
  quote-end -> .
  [else] -> quoted-scalar

block-scalar(min)
  newline + peek(indent < min) -> .
  [else] -> block-scalar(min)

plain-scalar(is-flow, min)
  scalar-end(is-flow) -> .
  peek(newline + (indent < min)) -> .
  [else] -> plain-scalar(min)
*/
function isEmpty(ch) {
    switch (ch) {
        case undefined:
        case ' ':
        case '\n':
        case '\r':
        case '\t':
            return true;
        default:
            return false;
    }
}
const hexDigits = new Set('0123456789ABCDEFabcdef');
const tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
const flowIndicatorChars = new Set(',[]{}');
const invalidAnchorChars = new Set(' ,[]{}\n\r\t');
const isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
/**
 * Splits an input string into lexical tokens, i.e. smaller strings that are
 * easily identifiable by `tokens.tokenType()`.
 *
 * Lexing starts always in a "stream" context. Incomplete input may be buffered
 * until a complete token can be emitted.
 *
 * In addition to slices of the original input, the following control characters
 * may also be emitted:
 *
 * - `\x02` (Start of Text): A document starts with the next token
 * - `\x18` (Cancel): Unexpected end of flow-mode (indicates an error)
 * - `\x1f` (Unit Separator): Next token is a scalar value
 * - `\u{FEFF}` (Byte order mark): Emitted separately outside documents
 */
class Lexer {
    constructor() {
        /**
         * Flag indicating whether the end of the current buffer marks the end of
         * all input
         */
        this.atEnd = false;
        /**
         * Explicit indent set in block scalar header, as an offset from the current
         * minimum indent, so e.g. set to 1 from a header `|2+`. Set to -1 if not
         * explicitly set.
         */
        this.blockScalarIndent = -1;
        /**
         * Block scalars that include a + (keep) chomping indicator in their header
         * include trailing empty lines, which are otherwise excluded from the
         * scalar's contents.
         */
        this.blockScalarKeep = false;
        /** Current input */
        this.buffer = '';
        /**
         * Flag noting whether the map value indicator : can immediately follow this
         * node within a flow context.
         */
        this.flowKey = false;
        /** Count of surrounding flow collection levels. */
        this.flowLevel = 0;
        /**
         * Minimum level of indentation required for next lines to be parsed as a
         * part of the current scalar value.
         */
        this.indentNext = 0;
        /** Indentation level of the current line. */
        this.indentValue = 0;
        /** Position of the next \n character. */
        this.lineEndPos = null;
        /** Stores the state of the lexer if reaching the end of incpomplete input */
        this.next = null;
        /** A pointer to `buffer`; the current position of the lexer. */
        this.pos = 0;
    }
    /**
     * Generate YAML tokens from the `source` string. If `incomplete`,
     * a part of the last line may be left as a buffer for the next call.
     *
     * @returns A generator of lexical tokens
     */
    *lex(source, incomplete = false) {
        if (source) {
            if (typeof source !== 'string')
                throw TypeError('source is not a string');
            this.buffer = this.buffer ? this.buffer + source : source;
            this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? 'stream';
        while (next && (incomplete || this.hasChars(1)))
            next = yield* this.parseNext(next);
    }
    atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === ' ' || ch === '\t')
            ch = this.buffer[++i];
        if (!ch || ch === '#' || ch === '\n')
            return true;
        if (ch === '\r')
            return this.buffer[i + 1] === '\n';
        return false;
    }
    charAt(n) {
        return this.buffer[this.pos + n];
    }
    continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
            let indent = 0;
            while (ch === ' ')
                ch = this.buffer[++indent + offset];
            if (ch === '\r') {
                const next = this.buffer[indent + offset + 1];
                if (next === '\n' || (!next && !this.atEnd))
                    return offset + indent + 1;
            }
            return ch === '\n' || indent >= this.indentNext || (!ch && !this.atEnd)
                ? offset + indent
                : -1;
        }
        if (ch === '-' || ch === '.') {
            const dt = this.buffer.substr(offset, 3);
            if ((dt === '---' || dt === '...') && isEmpty(this.buffer[offset + 3]))
                return -1;
        }
        return offset;
    }
    getLine() {
        let end = this.lineEndPos;
        if (typeof end !== 'number' || (end !== -1 && end < this.pos)) {
            end = this.buffer.indexOf('\n', this.pos);
            this.lineEndPos = end;
        }
        if (end === -1)
            return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === '\r')
            end -= 1;
        return this.buffer.substring(this.pos, end);
    }
    hasChars(n) {
        return this.pos + n <= this.buffer.length;
    }
    setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
    }
    peek(n) {
        return this.buffer.substr(this.pos, n);
    }
    *parseNext(next) {
        switch (next) {
            case 'stream':
                return yield* this.parseStream();
            case 'line-start':
                return yield* this.parseLineStart();
            case 'block-start':
                return yield* this.parseBlockStart();
            case 'doc':
                return yield* this.parseDocument();
            case 'flow':
                return yield* this.parseFlowCollection();
            case 'quoted-scalar':
                return yield* this.parseQuotedScalar();
            case 'block-scalar':
                return yield* this.parseBlockScalar();
            case 'plain-scalar':
                return yield* this.parsePlainScalar();
        }
    }
    *parseStream() {
        let line = this.getLine();
        if (line === null)
            return this.setNext('stream');
        if (line[0] === cst.BOM) {
            yield* this.pushCount(1);
            line = line.substring(1);
        }
        if (line[0] === '%') {
            let dirEnd = line.length;
            let cs = line.indexOf('#');
            while (cs !== -1) {
                const ch = line[cs - 1];
                if (ch === ' ' || ch === '\t') {
                    dirEnd = cs - 1;
                    break;
                }
                else {
                    cs = line.indexOf('#', cs + 1);
                }
            }
            while (true) {
                const ch = line[dirEnd - 1];
                if (ch === ' ' || ch === '\t')
                    dirEnd -= 1;
                else
                    break;
            }
            const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
            yield* this.pushCount(line.length - n); // possible comment
            this.pushNewline();
            return 'stream';
        }
        if (this.atLineEnd()) {
            const sp = yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - sp);
            yield* this.pushNewline();
            return 'stream';
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
    }
    *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
            return this.setNext('line-start');
        if (ch === '-' || ch === '.') {
            if (!this.atEnd && !this.hasChars(4))
                return this.setNext('line-start');
            const s = this.peek(3);
            if ((s === '---' || s === '...') && isEmpty(this.charAt(3))) {
                yield* this.pushCount(3);
                this.indentValue = 0;
                this.indentNext = 0;
                return s === '---' ? 'doc' : 'stream';
            }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
            this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
    }
    *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
            return this.setNext('block-start');
        if ((ch0 === '-' || ch0 === '?' || ch0 === ':') && isEmpty(ch1)) {
            const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
            this.indentNext = this.indentValue + 1;
            this.indentValue += n;
            return 'block-start';
        }
        return 'doc';
    }
    *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
            return this.setNext('doc');
        let n = yield* this.pushIndicators();
        switch (line[n]) {
            case '#':
                yield* this.pushCount(line.length - n);
            // fallthrough
            case undefined:
                yield* this.pushNewline();
                return yield* this.parseLineStart();
            case '{':
            case '[':
                yield* this.pushCount(1);
                this.flowKey = false;
                this.flowLevel = 1;
                return 'flow';
            case '}':
            case ']':
                // this is an error
                yield* this.pushCount(1);
                return 'doc';
            case '*':
                yield* this.pushUntil(isNotAnchorChar);
                return 'doc';
            case '"':
            case "'":
                return yield* this.parseQuotedScalar();
            case '|':
            case '>':
                n += yield* this.parseBlockScalarHeader();
                n += yield* this.pushSpaces(true);
                yield* this.pushCount(line.length - n);
                yield* this.pushNewline();
                return yield* this.parseBlockScalar();
            default:
                return yield* this.parsePlainScalar();
        }
    }
    *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
            nl = yield* this.pushNewline();
            if (nl > 0) {
                sp = yield* this.pushSpaces(false);
                this.indentValue = indent = sp;
            }
            else {
                sp = 0;
            }
            sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
            return this.setNext('flow');
        if ((indent !== -1 && indent < this.indentNext && line[0] !== '#') ||
            (indent === 0 &&
                (line.startsWith('---') || line.startsWith('...')) &&
                isEmpty(line[3]))) {
            // Allowing for the terminal ] or } at the same (rather than greater)
            // indent level as the initial [ or { is technically invalid, but
            // failing here would be surprising to users.
            const atFlowEndMarker = indent === this.indentNext - 1 &&
                this.flowLevel === 1 &&
                (line[0] === ']' || line[0] === '}');
            if (!atFlowEndMarker) {
                // this is an error
                this.flowLevel = 0;
                yield cst.FLOW_END;
                return yield* this.parseLineStart();
            }
        }
        let n = 0;
        while (line[n] === ',') {
            n += yield* this.pushCount(1);
            n += yield* this.pushSpaces(true);
            this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
            case undefined:
                return 'flow';
            case '#':
                yield* this.pushCount(line.length - n);
                return 'flow';
            case '{':
            case '[':
                yield* this.pushCount(1);
                this.flowKey = false;
                this.flowLevel += 1;
                return 'flow';
            case '}':
            case ']':
                yield* this.pushCount(1);
                this.flowKey = true;
                this.flowLevel -= 1;
                return this.flowLevel ? 'flow' : 'doc';
            case '*':
                yield* this.pushUntil(isNotAnchorChar);
                return 'flow';
            case '"':
            case "'":
                this.flowKey = true;
                return yield* this.parseQuotedScalar();
            case ':': {
                const next = this.charAt(1);
                if (this.flowKey || isEmpty(next) || next === ',') {
                    this.flowKey = false;
                    yield* this.pushCount(1);
                    yield* this.pushSpaces(true);
                    return 'flow';
                }
            }
            // fallthrough
            default:
                this.flowKey = false;
                return yield* this.parsePlainScalar();
        }
    }
    *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
            while (end !== -1 && this.buffer[end + 1] === "'")
                end = this.buffer.indexOf("'", end + 2);
        }
        else {
            // double-quote
            while (end !== -1) {
                let n = 0;
                while (this.buffer[end - 1 - n] === '\\')
                    n += 1;
                if (n % 2 === 0)
                    break;
                end = this.buffer.indexOf('"', end + 1);
            }
        }
        // Only looking for newlines within the quotes
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf('\n', this.pos);
        if (nl !== -1) {
            while (nl !== -1) {
                const cs = this.continueScalar(nl + 1);
                if (cs === -1)
                    break;
                nl = qb.indexOf('\n', cs);
            }
            if (nl !== -1) {
                // this is an error caused by an unexpected unindent
                end = nl - (qb[nl - 1] === '\r' ? 2 : 1);
            }
        }
        if (end === -1) {
            if (!this.atEnd)
                return this.setNext('quoted-scalar');
            end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? 'flow' : 'doc';
    }
    *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
            const ch = this.buffer[++i];
            if (ch === '+')
                this.blockScalarKeep = true;
            else if (ch > '0' && ch <= '9')
                this.blockScalarIndent = Number(ch) - 1;
            else if (ch !== '-')
                break;
        }
        return yield* this.pushUntil(ch => isEmpty(ch) || ch === '#');
    }
    *parseBlockScalar() {
        let nl = this.pos - 1; // may be -1 if this.pos === 0
        let indent = 0;
        let ch;
        loop: for (let i = this.pos; (ch = this.buffer[i]); ++i) {
            switch (ch) {
                case ' ':
                    indent += 1;
                    break;
                case '\n':
                    nl = i;
                    indent = 0;
                    break;
                case '\r': {
                    const next = this.buffer[i + 1];
                    if (!next && !this.atEnd)
                        return this.setNext('block-scalar');
                    if (next === '\n')
                        break;
                } // fallthrough
                default:
                    break loop;
            }
        }
        if (!ch && !this.atEnd)
            return this.setNext('block-scalar');
        if (indent >= this.indentNext) {
            if (this.blockScalarIndent === -1)
                this.indentNext = indent;
            else {
                this.indentNext =
                    this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
            }
            do {
                const cs = this.continueScalar(nl + 1);
                if (cs === -1)
                    break;
                nl = this.buffer.indexOf('\n', cs);
            } while (nl !== -1);
            if (nl === -1) {
                if (!this.atEnd)
                    return this.setNext('block-scalar');
                nl = this.buffer.length;
            }
        }
        // Trailing insufficiently indented tabs are invalid.
        // To catch that during parsing, we include them in the block scalar value.
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === ' ')
            ch = this.buffer[++i];
        if (ch === '\t') {
            while (ch === '\t' || ch === ' ' || ch === '\r' || ch === '\n')
                ch = this.buffer[++i];
            nl = i - 1;
        }
        else if (!this.blockScalarKeep) {
            do {
                let i = nl - 1;
                let ch = this.buffer[i];
                if (ch === '\r')
                    ch = this.buffer[--i];
                const lastChar = i; // Drop the line if last char not more indented
                while (ch === ' ')
                    ch = this.buffer[--i];
                if (ch === '\n' && i >= this.pos && i + 1 + indent > lastChar)
                    nl = i;
                else
                    break;
            } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
    }
    *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while ((ch = this.buffer[++i])) {
            if (ch === ':') {
                const next = this.buffer[i + 1];
                if (isEmpty(next) || (inFlow && flowIndicatorChars.has(next)))
                    break;
                end = i;
            }
            else if (isEmpty(ch)) {
                let next = this.buffer[i + 1];
                if (ch === '\r') {
                    if (next === '\n') {
                        i += 1;
                        ch = '\n';
                        next = this.buffer[i + 1];
                    }
                    else
                        end = i;
                }
                if (next === '#' || (inFlow && flowIndicatorChars.has(next)))
                    break;
                if (ch === '\n') {
                    const cs = this.continueScalar(i + 1);
                    if (cs === -1)
                        break;
                    i = Math.max(i, cs - 2); // to advance, but still account for ' #'
                }
            }
            else {
                if (inFlow && flowIndicatorChars.has(ch))
                    break;
                end = i;
            }
        }
        if (!ch && !this.atEnd)
            return this.setNext('plain-scalar');
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? 'flow' : 'doc';
    }
    *pushCount(n) {
        if (n > 0) {
            yield this.buffer.substr(this.pos, n);
            this.pos += n;
            return n;
        }
        return 0;
    }
    *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
            yield s;
            this.pos += s.length;
            return s.length;
        }
        else if (allowEmpty)
            yield '';
        return 0;
    }
    *pushIndicators() {
        let n = 0;
        loop: while (true) {
            switch (this.charAt(0)) {
                case '!':
                    n += yield* this.pushTag();
                    n += yield* this.pushSpaces(true);
                    continue loop;
                case '&':
                    n += yield* this.pushUntil(isNotAnchorChar);
                    n += yield* this.pushSpaces(true);
                    continue loop;
                case '-': // this is an error
                case '?': // this is an error outside flow collections
                case ':': {
                    const inFlow = this.flowLevel > 0;
                    const ch1 = this.charAt(1);
                    if (isEmpty(ch1) || (inFlow && flowIndicatorChars.has(ch1))) {
                        if (!inFlow)
                            this.indentNext = this.indentValue + 1;
                        else if (this.flowKey)
                            this.flowKey = false;
                        n += yield* this.pushCount(1);
                        n += yield* this.pushSpaces(true);
                        continue loop;
                    }
                }
            }
            break loop;
        }
        return n;
    }
    *pushTag() {
        if (this.charAt(1) === '<') {
            let i = this.pos + 2;
            let ch = this.buffer[i];
            while (!isEmpty(ch) && ch !== '>')
                ch = this.buffer[++i];
            return yield* this.pushToIndex(ch === '>' ? i + 1 : i, false);
        }
        else {
            let i = this.pos + 1;
            let ch = this.buffer[i];
            while (ch) {
                if (tagChars.has(ch))
                    ch = this.buffer[++i];
                else if (ch === '%' &&
                    hexDigits.has(this.buffer[i + 1]) &&
                    hexDigits.has(this.buffer[i + 2])) {
                    ch = this.buffer[(i += 3)];
                }
                else
                    break;
            }
            return yield* this.pushToIndex(i, false);
        }
    }
    *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === '\n')
            return yield* this.pushCount(1);
        else if (ch === '\r' && this.charAt(1) === '\n')
            return yield* this.pushCount(2);
        else
            return 0;
    }
    *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
            ch = this.buffer[++i];
        } while (ch === ' ' || (allowTabs && ch === '\t'));
        const n = i - this.pos;
        if (n > 0) {
            yield this.buffer.substr(this.pos, n);
            this.pos = i;
        }
        return n;
    }
    *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
            ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
    }
}

exports.Lexer = Lexer;


/***/ }),

/***/ 7953:
/***/ ((__unused_webpack_module, exports) => {



/**
 * Tracks newlines during parsing in order to provide an efficient API for
 * determining the one-indexed `{ line, col }` position for any offset
 * within the input.
 */
class LineCounter {
    constructor() {
        this.lineStarts = [];
        /**
         * Should be called in ascending order. Otherwise, call
         * `lineCounter.lineStarts.sort()` before calling `linePos()`.
         */
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        /**
         * Performs a binary search and returns the 1-indexed { line, col }
         * position of `offset`. If `line === 0`, `addNewLine` has never been
         * called or `offset` is before the first known newline.
         */
        this.linePos = (offset) => {
            let low = 0;
            let high = this.lineStarts.length;
            while (low < high) {
                const mid = (low + high) >> 1; // Math.floor((low + high) / 2)
                if (this.lineStarts[mid] < offset)
                    low = mid + 1;
                else
                    high = mid;
            }
            if (this.lineStarts[low] === offset)
                return { line: low + 1, col: 1 };
            if (low === 0)
                return { line: 0, col: offset };
            const start = this.lineStarts[low - 1];
            return { line: low, col: offset - start + 1 };
        };
    }
}

exports.LineCounter = LineCounter;


/***/ }),

/***/ 7221:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var node_process = __nccwpck_require__(932);
var cst = __nccwpck_require__(8454);
var lexer = __nccwpck_require__(10);

function includesToken(list, type) {
    for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
            return true;
    return false;
}
function findNonEmptyIndex(list) {
    for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
            case 'space':
            case 'comment':
            case 'newline':
                break;
            default:
                return i;
        }
    }
    return -1;
}
function isFlowToken(token) {
    switch (token?.type) {
        case 'alias':
        case 'scalar':
        case 'single-quoted-scalar':
        case 'double-quoted-scalar':
        case 'flow-collection':
            return true;
        default:
            return false;
    }
}
function getPrevProps(parent) {
    switch (parent.type) {
        case 'document':
            return parent.start;
        case 'block-map': {
            const it = parent.items[parent.items.length - 1];
            return it.sep ?? it.start;
        }
        case 'block-seq':
            return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
            return [];
    }
}
/** Note: May modify input array */
function getFirstKeyStartProps(prev) {
    if (prev.length === 0)
        return [];
    let i = prev.length;
    loop: while (--i >= 0) {
        switch (prev[i].type) {
            case 'doc-start':
            case 'explicit-key-ind':
            case 'map-value-ind':
            case 'seq-item-ind':
            case 'newline':
                break loop;
        }
    }
    while (prev[++i]?.type === 'space') {
        /* loop */
    }
    return prev.splice(i, prev.length);
}
function arrayPushArray(target, source) {
    // May exhaust call stack with large `source` array
    if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
    else
        for (let i = 0; i < source.length; ++i)
            target.push(source[i]);
}
function fixFlowSeqItems(fc) {
    if (fc.start.type === 'flow-seq-start') {
        for (const it of fc.items) {
            if (it.sep &&
                !it.value &&
                !includesToken(it.start, 'explicit-key-ind') &&
                !includesToken(it.sep, 'map-value-ind')) {
                if (it.key)
                    it.value = it.key;
                delete it.key;
                if (isFlowToken(it.value)) {
                    if (it.value.end)
                        arrayPushArray(it.value.end, it.sep);
                    else
                        it.value.end = it.sep;
                }
                else
                    arrayPushArray(it.start, it.sep);
                delete it.sep;
            }
        }
    }
}
/**
 * A YAML concrete syntax tree (CST) parser
 *
 * ```ts
 * const src: string = ...
 * for (const token of new Parser().parse(src)) {
 *   // token: Token
 * }
 * ```
 *
 * To use the parser with a user-provided lexer:
 *
 * ```ts
 * function* parse(source: string, lexer: Lexer) {
 *   const parser = new Parser()
 *   for (const lexeme of lexer.lex(source))
 *     yield* parser.next(lexeme)
 *   yield* parser.end()
 * }
 *
 * const src: string = ...
 * const lexer = new Lexer()
 * for (const token of parse(src, lexer)) {
 *   // token: Token
 * }
 * ```
 */
class Parser {
    /**
     * @param onNewLine - If defined, called separately with the start position of
     *   each new line (in `parse()`, including the start of input).
     */
    constructor(onNewLine) {
        /** If true, space and sequence indicators count as indentation */
        this.atNewLine = true;
        /** If true, next token is a scalar value */
        this.atScalar = false;
        /** Current indentation level */
        this.indent = 0;
        /** Current offset since the start of parsing */
        this.offset = 0;
        /** On the same line with a block map key */
        this.onKeyLine = false;
        /** Top indicates the node that's currently being built */
        this.stack = [];
        /** The source of the current token, set in parse() */
        this.source = '';
        /** The type of the current token, set in parse() */
        this.type = '';
        // Must be defined after `next()`
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
    }
    /**
     * Parse `source` as a YAML stream.
     * If `incomplete`, a part of the last line may be left as a buffer for the next call.
     *
     * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
     *
     * @returns A generator of tokens representing each directive, document, and other structure.
     */
    *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
            this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
            yield* this.next(lexeme);
        if (!incomplete)
            yield* this.end();
    }
    /**
     * Advance the parser by the `source` of one lexical token.
     */
    *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
            console.log('|', cst.prettyToken(source));
        if (this.atScalar) {
            this.atScalar = false;
            yield* this.step();
            this.offset += source.length;
            return;
        }
        const type = cst.tokenType(source);
        if (!type) {
            const message = `Not a YAML token: ${source}`;
            yield* this.pop({ type: 'error', offset: this.offset, message, source });
            this.offset += source.length;
        }
        else if (type === 'scalar') {
            this.atNewLine = false;
            this.atScalar = true;
            this.type = 'scalar';
        }
        else {
            this.type = type;
            yield* this.step();
            switch (type) {
                case 'newline':
                    this.atNewLine = true;
                    this.indent = 0;
                    if (this.onNewLine)
                        this.onNewLine(this.offset + source.length);
                    break;
                case 'space':
                    if (this.atNewLine && source[0] === ' ')
                        this.indent += source.length;
                    break;
                case 'explicit-key-ind':
                case 'map-value-ind':
                case 'seq-item-ind':
                    if (this.atNewLine)
                        this.indent += source.length;
                    break;
                case 'doc-mode':
                case 'flow-error-end':
                    return;
                default:
                    this.atNewLine = false;
            }
            this.offset += source.length;
        }
    }
    /** Call at end of input to push out any remaining constructions */
    *end() {
        while (this.stack.length > 0)
            yield* this.pop();
    }
    get sourceToken() {
        const st = {
            type: this.type,
            offset: this.offset,
            indent: this.indent,
            source: this.source
        };
        return st;
    }
    *step() {
        const top = this.peek(1);
        if (this.type === 'doc-end' && top?.type !== 'doc-end') {
            while (this.stack.length > 0)
                yield* this.pop();
            this.stack.push({
                type: 'doc-end',
                offset: this.offset,
                source: this.source
            });
            return;
        }
        if (!top)
            return yield* this.stream();
        switch (top.type) {
            case 'document':
                return yield* this.document(top);
            case 'alias':
            case 'scalar':
            case 'single-quoted-scalar':
            case 'double-quoted-scalar':
                return yield* this.scalar(top);
            case 'block-scalar':
                return yield* this.blockScalar(top);
            case 'block-map':
                return yield* this.blockMap(top);
            case 'block-seq':
                return yield* this.blockSequence(top);
            case 'flow-collection':
                return yield* this.flowCollection(top);
            case 'doc-end':
                return yield* this.documentEnd(top);
        }
        /* istanbul ignore next should not happen */
        yield* this.pop();
    }
    peek(n) {
        return this.stack[this.stack.length - n];
    }
    *pop(error) {
        const token = error ?? this.stack.pop();
        /* istanbul ignore if should not happen */
        if (!token) {
            const message = 'Tried to pop an empty stack';
            yield { type: 'error', offset: this.offset, source: '', message };
        }
        else if (this.stack.length === 0) {
            yield token;
        }
        else {
            const top = this.peek(1);
            if (token.type === 'block-scalar') {
                // Block scalars use their parent rather than header indent
                token.indent = 'indent' in top ? top.indent : 0;
            }
            else if (token.type === 'flow-collection' && top.type === 'document') {
                // Ignore all indent for top-level flow collections
                token.indent = 0;
            }
            if (token.type === 'flow-collection')
                fixFlowSeqItems(token);
            switch (top.type) {
                case 'document':
                    top.value = token;
                    break;
                case 'block-scalar':
                    top.props.push(token); // error
                    break;
                case 'block-map': {
                    const it = top.items[top.items.length - 1];
                    if (it.value) {
                        top.items.push({ start: [], key: token, sep: [] });
                        this.onKeyLine = true;
                        return;
                    }
                    else if (it.sep) {
                        it.value = token;
                    }
                    else {
                        Object.assign(it, { key: token, sep: [] });
                        this.onKeyLine = !it.explicitKey;
                        return;
                    }
                    break;
                }
                case 'block-seq': {
                    const it = top.items[top.items.length - 1];
                    if (it.value)
                        top.items.push({ start: [], value: token });
                    else
                        it.value = token;
                    break;
                }
                case 'flow-collection': {
                    const it = top.items[top.items.length - 1];
                    if (!it || it.value)
                        top.items.push({ start: [], key: token, sep: [] });
                    else if (it.sep)
                        it.value = token;
                    else
                        Object.assign(it, { key: token, sep: [] });
                    return;
                }
                /* istanbul ignore next should not happen */
                default:
                    yield* this.pop();
                    yield* this.pop(token);
            }
            if ((top.type === 'document' ||
                top.type === 'block-map' ||
                top.type === 'block-seq') &&
                (token.type === 'block-map' || token.type === 'block-seq')) {
                const last = token.items[token.items.length - 1];
                if (last &&
                    !last.sep &&
                    !last.value &&
                    last.start.length > 0 &&
                    findNonEmptyIndex(last.start) === -1 &&
                    (token.indent === 0 ||
                        last.start.every(st => st.type !== 'comment' || st.indent < token.indent))) {
                    if (top.type === 'document')
                        top.end = last.start;
                    else
                        top.items.push({ start: last.start });
                    token.items.splice(-1, 1);
                }
            }
        }
    }
    *stream() {
        switch (this.type) {
            case 'directive-line':
                yield { type: 'directive', offset: this.offset, source: this.source };
                return;
            case 'byte-order-mark':
            case 'space':
            case 'comment':
            case 'newline':
                yield this.sourceToken;
                return;
            case 'doc-mode':
            case 'doc-start': {
                const doc = {
                    type: 'document',
                    offset: this.offset,
                    start: []
                };
                if (this.type === 'doc-start')
                    doc.start.push(this.sourceToken);
                this.stack.push(doc);
                return;
            }
        }
        yield {
            type: 'error',
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML stream`,
            source: this.source
        };
    }
    *document(doc) {
        if (doc.value)
            return yield* this.lineEnd(doc);
        switch (this.type) {
            case 'doc-start': {
                if (findNonEmptyIndex(doc.start) !== -1) {
                    yield* this.pop();
                    yield* this.step();
                }
                else
                    doc.start.push(this.sourceToken);
                return;
            }
            case 'anchor':
            case 'tag':
            case 'space':
            case 'comment':
            case 'newline':
                doc.start.push(this.sourceToken);
                return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
            this.stack.push(bv);
        else {
            yield {
                type: 'error',
                offset: this.offset,
                message: `Unexpected ${this.type} token in YAML document`,
                source: this.source
            };
        }
    }
    *scalar(scalar) {
        if (this.type === 'map-value-ind') {
            const prev = getPrevProps(this.peek(2));
            const start = getFirstKeyStartProps(prev);
            let sep;
            if (scalar.end) {
                sep = scalar.end;
                sep.push(this.sourceToken);
                delete scalar.end;
            }
            else
                sep = [this.sourceToken];
            const map = {
                type: 'block-map',
                offset: scalar.offset,
                indent: scalar.indent,
                items: [{ start, key: scalar, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
        }
        else
            yield* this.lineEnd(scalar);
    }
    *blockScalar(scalar) {
        switch (this.type) {
            case 'space':
            case 'comment':
            case 'newline':
                scalar.props.push(this.sourceToken);
                return;
            case 'scalar':
                scalar.source = this.source;
                // block-scalar source includes trailing newline
                this.atNewLine = true;
                this.indent = 0;
                if (this.onNewLine) {
                    let nl = this.source.indexOf('\n') + 1;
                    while (nl !== 0) {
                        this.onNewLine(this.offset + nl);
                        nl = this.source.indexOf('\n', nl) + 1;
                    }
                }
                yield* this.pop();
                break;
            /* istanbul ignore next should not happen */
            default:
                yield* this.pop();
                yield* this.step();
        }
    }
    *blockMap(map) {
        const it = map.items[map.items.length - 1];
        // it.sep is true-ish if pair already has key or : separator
        switch (this.type) {
            case 'newline':
                this.onKeyLine = false;
                if (it.value) {
                    const end = 'end' in it.value ? it.value.end : undefined;
                    const last = Array.isArray(end) ? end[end.length - 1] : undefined;
                    if (last?.type === 'comment')
                        end?.push(this.sourceToken);
                    else
                        map.items.push({ start: [this.sourceToken] });
                }
                else if (it.sep) {
                    it.sep.push(this.sourceToken);
                }
                else {
                    it.start.push(this.sourceToken);
                }
                return;
            case 'space':
            case 'comment':
                if (it.value) {
                    map.items.push({ start: [this.sourceToken] });
                }
                else if (it.sep) {
                    it.sep.push(this.sourceToken);
                }
                else {
                    if (this.atIndentedComment(it.start, map.indent)) {
                        const prev = map.items[map.items.length - 2];
                        const end = prev?.value?.end;
                        if (Array.isArray(end)) {
                            arrayPushArray(end, it.start);
                            end.push(this.sourceToken);
                            map.items.pop();
                            return;
                        }
                    }
                    it.start.push(this.sourceToken);
                }
                return;
        }
        if (this.indent >= map.indent) {
            const atMapIndent = !this.onKeyLine && this.indent === map.indent;
            const atNextItem = atMapIndent &&
                (it.sep || it.explicitKey) &&
                this.type !== 'seq-item-ind';
            // For empty nodes, assign newline-separated not indented empty tokens to following node
            let start = [];
            if (atNextItem && it.sep && !it.value) {
                const nl = [];
                for (let i = 0; i < it.sep.length; ++i) {
                    const st = it.sep[i];
                    switch (st.type) {
                        case 'newline':
                            nl.push(i);
                            break;
                        case 'space':
                            break;
                        case 'comment':
                            if (st.indent > map.indent)
                                nl.length = 0;
                            break;
                        default:
                            nl.length = 0;
                    }
                }
                if (nl.length >= 2)
                    start = it.sep.splice(nl[1]);
            }
            switch (this.type) {
                case 'anchor':
                case 'tag':
                    if (atNextItem || it.value) {
                        start.push(this.sourceToken);
                        map.items.push({ start });
                        this.onKeyLine = true;
                    }
                    else if (it.sep) {
                        it.sep.push(this.sourceToken);
                    }
                    else {
                        it.start.push(this.sourceToken);
                    }
                    return;
                case 'explicit-key-ind':
                    if (!it.sep && !it.explicitKey) {
                        it.start.push(this.sourceToken);
                        it.explicitKey = true;
                    }
                    else if (atNextItem || it.value) {
                        start.push(this.sourceToken);
                        map.items.push({ start, explicitKey: true });
                    }
                    else {
                        this.stack.push({
                            type: 'block-map',
                            offset: this.offset,
                            indent: this.indent,
                            items: [{ start: [this.sourceToken], explicitKey: true }]
                        });
                    }
                    this.onKeyLine = true;
                    return;
                case 'map-value-ind':
                    if (it.explicitKey) {
                        if (!it.sep) {
                            if (includesToken(it.start, 'newline')) {
                                Object.assign(it, { key: null, sep: [this.sourceToken] });
                            }
                            else {
                                const start = getFirstKeyStartProps(it.start);
                                this.stack.push({
                                    type: 'block-map',
                                    offset: this.offset,
                                    indent: this.indent,
                                    items: [{ start, key: null, sep: [this.sourceToken] }]
                                });
                            }
                        }
                        else if (it.value) {
                            map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                        }
                        else if (includesToken(it.sep, 'map-value-ind')) {
                            this.stack.push({
                                type: 'block-map',
                                offset: this.offset,
                                indent: this.indent,
                                items: [{ start, key: null, sep: [this.sourceToken] }]
                            });
                        }
                        else if (isFlowToken(it.key) &&
                            !includesToken(it.sep, 'newline')) {
                            const start = getFirstKeyStartProps(it.start);
                            const key = it.key;
                            const sep = it.sep;
                            sep.push(this.sourceToken);
                            // @ts-expect-error type guard is wrong here
                            delete it.key;
                            // @ts-expect-error type guard is wrong here
                            delete it.sep;
                            this.stack.push({
                                type: 'block-map',
                                offset: this.offset,
                                indent: this.indent,
                                items: [{ start, key, sep }]
                            });
                        }
                        else if (start.length > 0) {
                            // Not actually at next item
                            it.sep = it.sep.concat(start, this.sourceToken);
                        }
                        else {
                            it.sep.push(this.sourceToken);
                        }
                    }
                    else {
                        if (!it.sep) {
                            Object.assign(it, { key: null, sep: [this.sourceToken] });
                        }
                        else if (it.value || atNextItem) {
                            map.items.push({ start, key: null, sep: [this.sourceToken] });
                        }
                        else if (includesToken(it.sep, 'map-value-ind')) {
                            this.stack.push({
                                type: 'block-map',
                                offset: this.offset,
                                indent: this.indent,
                                items: [{ start: [], key: null, sep: [this.sourceToken] }]
                            });
                        }
                        else {
                            it.sep.push(this.sourceToken);
                        }
                    }
                    this.onKeyLine = true;
                    return;
                case 'alias':
                case 'scalar':
                case 'single-quoted-scalar':
                case 'double-quoted-scalar': {
                    const fs = this.flowScalar(this.type);
                    if (atNextItem || it.value) {
                        map.items.push({ start, key: fs, sep: [] });
                        this.onKeyLine = true;
                    }
                    else if (it.sep) {
                        this.stack.push(fs);
                    }
                    else {
                        Object.assign(it, { key: fs, sep: [] });
                        this.onKeyLine = true;
                    }
                    return;
                }
                default: {
                    const bv = this.startBlockValue(map);
                    if (bv) {
                        if (bv.type === 'block-seq') {
                            if (!it.explicitKey &&
                                it.sep &&
                                !includesToken(it.sep, 'newline')) {
                                yield* this.pop({
                                    type: 'error',
                                    offset: this.offset,
                                    message: 'Unexpected block-seq-ind on same line with key',
                                    source: this.source
                                });
                                return;
                            }
                        }
                        else if (atMapIndent) {
                            map.items.push({ start });
                        }
                        this.stack.push(bv);
                        return;
                    }
                }
            }
        }
        yield* this.pop();
        yield* this.step();
    }
    *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
            case 'newline':
                if (it.value) {
                    const end = 'end' in it.value ? it.value.end : undefined;
                    const last = Array.isArray(end) ? end[end.length - 1] : undefined;
                    if (last?.type === 'comment')
                        end?.push(this.sourceToken);
                    else
                        seq.items.push({ start: [this.sourceToken] });
                }
                else
                    it.start.push(this.sourceToken);
                return;
            case 'space':
            case 'comment':
                if (it.value)
                    seq.items.push({ start: [this.sourceToken] });
                else {
                    if (this.atIndentedComment(it.start, seq.indent)) {
                        const prev = seq.items[seq.items.length - 2];
                        const end = prev?.value?.end;
                        if (Array.isArray(end)) {
                            arrayPushArray(end, it.start);
                            end.push(this.sourceToken);
                            seq.items.pop();
                            return;
                        }
                    }
                    it.start.push(this.sourceToken);
                }
                return;
            case 'anchor':
            case 'tag':
                if (it.value || this.indent <= seq.indent)
                    break;
                it.start.push(this.sourceToken);
                return;
            case 'seq-item-ind':
                if (this.indent !== seq.indent)
                    break;
                if (it.value || includesToken(it.start, 'seq-item-ind'))
                    seq.items.push({ start: [this.sourceToken] });
                else
                    it.start.push(this.sourceToken);
                return;
        }
        if (this.indent > seq.indent) {
            const bv = this.startBlockValue(seq);
            if (bv) {
                this.stack.push(bv);
                return;
            }
        }
        yield* this.pop();
        yield* this.step();
    }
    *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === 'flow-error-end') {
            let top;
            do {
                yield* this.pop();
                top = this.peek(1);
            } while (top?.type === 'flow-collection');
        }
        else if (fc.end.length === 0) {
            switch (this.type) {
                case 'comma':
                case 'explicit-key-ind':
                    if (!it || it.sep)
                        fc.items.push({ start: [this.sourceToken] });
                    else
                        it.start.push(this.sourceToken);
                    return;
                case 'map-value-ind':
                    if (!it || it.value)
                        fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
                    else if (it.sep)
                        it.sep.push(this.sourceToken);
                    else
                        Object.assign(it, { key: null, sep: [this.sourceToken] });
                    return;
                case 'space':
                case 'comment':
                case 'newline':
                case 'anchor':
                case 'tag':
                    if (!it || it.value)
                        fc.items.push({ start: [this.sourceToken] });
                    else if (it.sep)
                        it.sep.push(this.sourceToken);
                    else
                        it.start.push(this.sourceToken);
                    return;
                case 'alias':
                case 'scalar':
                case 'single-quoted-scalar':
                case 'double-quoted-scalar': {
                    const fs = this.flowScalar(this.type);
                    if (!it || it.value)
                        fc.items.push({ start: [], key: fs, sep: [] });
                    else if (it.sep)
                        this.stack.push(fs);
                    else
                        Object.assign(it, { key: fs, sep: [] });
                    return;
                }
                case 'flow-map-end':
                case 'flow-seq-end':
                    fc.end.push(this.sourceToken);
                    return;
            }
            const bv = this.startBlockValue(fc);
            /* istanbul ignore else should not happen */
            if (bv)
                this.stack.push(bv);
            else {
                yield* this.pop();
                yield* this.step();
            }
        }
        else {
            const parent = this.peek(2);
            if (parent.type === 'block-map' &&
                ((this.type === 'map-value-ind' && parent.indent === fc.indent) ||
                    (this.type === 'newline' &&
                        !parent.items[parent.items.length - 1].sep))) {
                yield* this.pop();
                yield* this.step();
            }
            else if (this.type === 'map-value-ind' &&
                parent.type !== 'flow-collection') {
                const prev = getPrevProps(parent);
                const start = getFirstKeyStartProps(prev);
                fixFlowSeqItems(fc);
                const sep = fc.end.splice(1, fc.end.length);
                sep.push(this.sourceToken);
                const map = {
                    type: 'block-map',
                    offset: fc.offset,
                    indent: fc.indent,
                    items: [{ start, key: fc, sep }]
                };
                this.onKeyLine = true;
                this.stack[this.stack.length - 1] = map;
            }
            else {
                yield* this.lineEnd(fc);
            }
        }
    }
    flowScalar(type) {
        if (this.onNewLine) {
            let nl = this.source.indexOf('\n') + 1;
            while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf('\n', nl) + 1;
            }
        }
        return {
            type,
            offset: this.offset,
            indent: this.indent,
            source: this.source
        };
    }
    startBlockValue(parent) {
        switch (this.type) {
            case 'alias':
            case 'scalar':
            case 'single-quoted-scalar':
            case 'double-quoted-scalar':
                return this.flowScalar(this.type);
            case 'block-scalar-header':
                return {
                    type: 'block-scalar',
                    offset: this.offset,
                    indent: this.indent,
                    props: [this.sourceToken],
                    source: ''
                };
            case 'flow-map-start':
            case 'flow-seq-start':
                return {
                    type: 'flow-collection',
                    offset: this.offset,
                    indent: this.indent,
                    start: this.sourceToken,
                    items: [],
                    end: []
                };
            case 'seq-item-ind':
                return {
                    type: 'block-seq',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [this.sourceToken] }]
                };
            case 'explicit-key-ind': {
                this.onKeyLine = true;
                const prev = getPrevProps(parent);
                const start = getFirstKeyStartProps(prev);
                start.push(this.sourceToken);
                return {
                    type: 'block-map',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, explicitKey: true }]
                };
            }
            case 'map-value-ind': {
                this.onKeyLine = true;
                const prev = getPrevProps(parent);
                const start = getFirstKeyStartProps(prev);
                return {
                    type: 'block-map',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                };
            }
        }
        return null;
    }
    atIndentedComment(start, indent) {
        if (this.type !== 'comment')
            return false;
        if (this.indent <= indent)
            return false;
        return start.every(st => st.type === 'newline' || st.type === 'space');
    }
    *documentEnd(docEnd) {
        if (this.type !== 'doc-mode') {
            if (docEnd.end)
                docEnd.end.push(this.sourceToken);
            else
                docEnd.end = [this.sourceToken];
            if (this.type === 'newline')
                yield* this.pop();
        }
    }
    *lineEnd(token) {
        switch (this.type) {
            case 'comma':
            case 'doc-start':
            case 'doc-end':
            case 'flow-seq-end':
            case 'flow-map-end':
            case 'map-value-ind':
                yield* this.pop();
                yield* this.step();
                break;
            case 'newline':
                this.onKeyLine = false;
            // fallthrough
            case 'space':
            case 'comment':
            default:
                // all other values are errors
                if (token.end)
                    token.end.push(this.sourceToken);
                else
                    token.end = [this.sourceToken];
                if (this.type === 'newline')
                    yield* this.pop();
        }
    }
}

exports.Parser = Parser;


/***/ }),

/***/ 1282:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var composer = __nccwpck_require__(9261);
var Document = __nccwpck_require__(5244);
var errors = __nccwpck_require__(1269);
var log = __nccwpck_require__(9982);
var identity = __nccwpck_require__(3662);
var lineCounter = __nccwpck_require__(7953);
var parser = __nccwpck_require__(7221);

function parseOptions(options) {
    const prettyErrors = options.prettyErrors !== false;
    const lineCounter$1 = options.lineCounter || (prettyErrors && new lineCounter.LineCounter()) || null;
    return { lineCounter: lineCounter$1, prettyErrors };
}
/**
 * Parse the input as a stream of YAML documents.
 *
 * Documents should be separated from each other by `...` or `---` marker lines.
 *
 * @returns If an empty `docs` array is returned, it will be of type
 *   EmptyStream and contain additional stream information. In
 *   TypeScript, you should use `'empty' in docs` as a type guard for it.
 */
function parseAllDocuments(source, options = {}) {
    const { lineCounter, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter?.addNewLine);
    const composer$1 = new composer.Composer(options);
    const docs = Array.from(composer$1.compose(parser$1.parse(source)));
    if (prettyErrors && lineCounter)
        for (const doc of docs) {
            doc.errors.forEach(errors.prettifyError(source, lineCounter));
            doc.warnings.forEach(errors.prettifyError(source, lineCounter));
        }
    if (docs.length > 0)
        return docs;
    return Object.assign([], { empty: true }, composer$1.streamInfo());
}
/** Parse an input string into a single YAML.Document */
function parseDocument(source, options = {}) {
    const { lineCounter, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter?.addNewLine);
    const composer$1 = new composer.Composer(options);
    // `doc` is always set by compose.end(true) at the very latest
    let doc = null;
    for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
            doc = _doc;
        else if (doc.options.logLevel !== 'silent') {
            doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), 'MULTIPLE_DOCS', 'Source contains multiple documents; please use YAML.parseAllDocuments()'));
            break;
        }
    }
    if (prettyErrors && lineCounter) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter));
    }
    return doc;
}
function parse(src, reviver, options) {
    let _reviver = undefined;
    if (typeof reviver === 'function') {
        _reviver = reviver;
    }
    else if (options === undefined && reviver && typeof reviver === 'object') {
        options = reviver;
    }
    const doc = parseDocument(src, options);
    if (!doc)
        return null;
    doc.warnings.forEach(warning => log.warn(doc.options.logLevel, warning));
    if (doc.errors.length > 0) {
        if (doc.options.logLevel !== 'silent')
            throw doc.errors[0];
        else
            doc.errors = [];
    }
    return doc.toJS(Object.assign({ reviver: _reviver }, options));
}
function stringify(value, replacer, options) {
    let _replacer = null;
    if (typeof replacer === 'function' || Array.isArray(replacer)) {
        _replacer = replacer;
    }
    else if (options === undefined && replacer) {
        options = replacer;
    }
    if (typeof options === 'string')
        options = options.length;
    if (typeof options === 'number') {
        const indent = Math.round(options);
        options = indent < 1 ? undefined : indent > 8 ? { indent: 8 } : { indent };
    }
    if (value === undefined) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
            return undefined;
    }
    if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
    return new Document.Document(value, _replacer, options).toString(options);
}

exports.parse = parse;
exports.parseAllDocuments = parseAllDocuments;
exports.parseDocument = parseDocument;
exports.stringify = stringify;


/***/ }),

/***/ 3015:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var map = __nccwpck_require__(4912);
var seq = __nccwpck_require__(2085);
var string = __nccwpck_require__(5025);
var tags = __nccwpck_require__(8365);

const sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
class Schema {
    constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat)
            ? tags.getTags(compat, 'compat')
            : compat
                ? tags.getTags(null, compat)
                : null;
        this.name = (typeof schema === 'string' && schema) || 'core';
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        // Used by createMap()
        this.sortMapEntries =
            typeof sortMapEntries === 'function'
                ? sortMapEntries
                : sortMapEntries === true
                    ? sortMapEntriesByKey
                    : null;
    }
    clone() {
        const copy = Object.create(Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
    }
}

exports.Schema = Schema;


/***/ }),

/***/ 4912:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var YAMLMap = __nccwpck_require__(2613);

const map = {
    collection: 'map',
    default: true,
    nodeClass: YAMLMap.YAMLMap,
    tag: 'tag:yaml.org,2002:map',
    resolve(map, onError) {
        if (!identity.isMap(map))
            onError('Expected a mapping for this tag');
        return map;
    },
    createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
};

exports.map = map;


/***/ }),

/***/ 5257:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);

const nullTag = {
    identify: value => value == null,
    createNode: () => new Scalar.Scalar(null),
    default: true,
    tag: 'tag:yaml.org,2002:null',
    test: /^(?:~|[Nn]ull|NULL)?$/,
    resolve: () => new Scalar.Scalar(null),
    stringify: ({ source }, ctx) => typeof source === 'string' && nullTag.test.test(source)
        ? source
        : ctx.options.nullStr
};

exports.nullTag = nullTag;


/***/ }),

/***/ 2085:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var YAMLSeq = __nccwpck_require__(3584);

const seq = {
    collection: 'seq',
    default: true,
    nodeClass: YAMLSeq.YAMLSeq,
    tag: 'tag:yaml.org,2002:seq',
    resolve(seq, onError) {
        if (!identity.isSeq(seq))
            onError('Expected a sequence for this tag');
        return seq;
    },
    createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
};

exports.seq = seq;


/***/ }),

/***/ 5025:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyString = __nccwpck_require__(5098);

const string = {
    identify: value => typeof value === 'string',
    default: true,
    tag: 'tag:yaml.org,2002:str',
    resolve: str => str,
    stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
    }
};

exports.string = string;


/***/ }),

/***/ 3850:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);

const boolTag = {
    identify: value => typeof value === 'boolean',
    default: true,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
    resolve: str => new Scalar.Scalar(str[0] === 't' || str[0] === 'T'),
    stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
            const sv = source[0] === 't' || source[0] === 'T';
            if (value === sv)
                return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
};

exports.boolTag = boolTag;


/***/ }),

/***/ 6258:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);
var stringifyNumber = __nccwpck_require__(1002);

const floatNaN = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: str => str.slice(-3).toLowerCase() === 'nan'
        ? NaN
        : str[0] === '-'
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
};
const floatExp = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    format: 'EXP',
    test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
    resolve: str => parseFloat(str),
    stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
};
const float = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
    resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf('.');
        if (dot !== -1 && str[str.length - 1] === '0')
            node.minFractionDigits = str.length - dot - 1;
        return node;
    },
    stringify: stringifyNumber.stringifyNumber
};

exports.float = float;
exports.floatExp = floatExp;
exports.floatNaN = floatNaN;


/***/ }),

/***/ 9013:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyNumber = __nccwpck_require__(1002);

const intIdentify = (value) => typeof value === 'bigint' || Number.isInteger(value);
const intResolve = (str, offset, radix, { intAsBigInt }) => (intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix));
function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
    return stringifyNumber.stringifyNumber(node);
}
const intOct = {
    identify: value => intIdentify(value) && value >= 0,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'OCT',
    test: /^0o[0-7]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
    stringify: node => intStringify(node, 8, '0o')
};
const int = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    test: /^[-+]?[0-9]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
};
const intHex = {
    identify: value => intIdentify(value) && value >= 0,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'HEX',
    test: /^0x[0-9a-fA-F]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: node => intStringify(node, 16, '0x')
};

exports.int = int;
exports.intHex = intHex;
exports.intOct = intOct;


/***/ }),

/***/ 1213:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var map = __nccwpck_require__(4912);
var _null = __nccwpck_require__(5257);
var seq = __nccwpck_require__(2085);
var string = __nccwpck_require__(5025);
var bool = __nccwpck_require__(3850);
var float = __nccwpck_require__(6258);
var int = __nccwpck_require__(9013);

const schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.boolTag,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float
];

exports.schema = schema;


/***/ }),

/***/ 3202:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);
var map = __nccwpck_require__(4912);
var seq = __nccwpck_require__(2085);

function intIdentify(value) {
    return typeof value === 'bigint' || Number.isInteger(value);
}
const stringifyJSON = ({ value }) => JSON.stringify(value);
const jsonScalars = [
    {
        identify: value => typeof value === 'string',
        default: true,
        tag: 'tag:yaml.org,2002:str',
        resolve: str => str,
        stringify: stringifyJSON
    },
    {
        identify: value => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: 'tag:yaml.org,2002:null',
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
    },
    {
        identify: value => typeof value === 'boolean',
        default: true,
        tag: 'tag:yaml.org,2002:bool',
        test: /^true$|^false$/,
        resolve: str => str === 'true',
        stringify: stringifyJSON
    },
    {
        identify: intIdentify,
        default: true,
        tag: 'tag:yaml.org,2002:int',
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
    },
    {
        identify: value => typeof value === 'number',
        default: true,
        tag: 'tag:yaml.org,2002:float',
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: str => parseFloat(str),
        stringify: stringifyJSON
    }
];
const jsonError = {
    default: true,
    tag: '',
    test: /^/,
    resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
    }
};
const schema = [map.map, seq.seq].concat(jsonScalars, jsonError);

exports.schema = schema;


/***/ }),

/***/ 8365:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var map = __nccwpck_require__(4912);
var _null = __nccwpck_require__(5257);
var seq = __nccwpck_require__(2085);
var string = __nccwpck_require__(5025);
var bool = __nccwpck_require__(3850);
var float = __nccwpck_require__(6258);
var int = __nccwpck_require__(9013);
var schema = __nccwpck_require__(1213);
var schema$1 = __nccwpck_require__(3202);
var binary = __nccwpck_require__(9638);
var merge = __nccwpck_require__(4067);
var omap = __nccwpck_require__(3402);
var pairs = __nccwpck_require__(1270);
var schema$2 = __nccwpck_require__(6632);
var set = __nccwpck_require__(5871);
var timestamp = __nccwpck_require__(3687);

const schemas = new Map([
    ['core', schema.schema],
    ['failsafe', [map.map, seq.seq, string.string]],
    ['json', schema$1.schema],
    ['yaml11', schema$2.schema],
    ['yaml-1.1', schema$2.schema]
]);
const tagsByName = {
    binary: binary.binary,
    bool: bool.boolTag,
    float: float.float,
    floatExp: float.floatExp,
    floatNaN: float.floatNaN,
    floatTime: timestamp.floatTime,
    int: int.int,
    intHex: int.intHex,
    intOct: int.intOct,
    intTime: timestamp.intTime,
    map: map.map,
    merge: merge.merge,
    null: _null.nullTag,
    omap: omap.omap,
    pairs: pairs.pairs,
    seq: seq.seq,
    set: set.set,
    timestamp: timestamp.timestamp
};
const coreKnownTags = {
    'tag:yaml.org,2002:binary': binary.binary,
    'tag:yaml.org,2002:merge': merge.merge,
    'tag:yaml.org,2002:omap': omap.omap,
    'tag:yaml.org,2002:pairs': pairs.pairs,
    'tag:yaml.org,2002:set': set.set,
    'tag:yaml.org,2002:timestamp': timestamp.timestamp
};
function getTags(customTags, schemaName, addMergeTag) {
    const schemaTags = schemas.get(schemaName);
    if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge)
            ? schemaTags.concat(merge.merge)
            : schemaTags.slice();
    }
    let tags = schemaTags;
    if (!tags) {
        if (Array.isArray(customTags))
            tags = [];
        else {
            const keys = Array.from(schemas.keys())
                .filter(key => key !== 'yaml11')
                .map(key => JSON.stringify(key))
                .join(', ');
            throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
    }
    if (Array.isArray(customTags)) {
        for (const tag of customTags)
            tags = tags.concat(tag);
    }
    else if (typeof customTags === 'function') {
        tags = customTags(tags.slice());
    }
    if (addMergeTag)
        tags = tags.concat(merge.merge);
    return tags.reduce((tags, tag) => {
        const tagObj = typeof tag === 'string' ? tagsByName[tag] : tag;
        if (!tagObj) {
            const tagName = JSON.stringify(tag);
            const keys = Object.keys(tagsByName)
                .map(key => JSON.stringify(key))
                .join(', ');
            throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags.includes(tagObj))
            tags.push(tagObj);
        return tags;
    }, []);
}

exports.coreKnownTags = coreKnownTags;
exports.getTags = getTags;


/***/ }),

/***/ 9638:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var node_buffer = __nccwpck_require__(181);
var Scalar = __nccwpck_require__(8732);
var stringifyString = __nccwpck_require__(5098);

const binary = {
    identify: value => value instanceof Uint8Array, // Buffer inherits from Uint8Array
    default: false,
    tag: 'tag:yaml.org,2002:binary',
    /**
     * Returns a Buffer in node and an Uint8Array in browsers
     *
     * To use the resulting buffer as an image, you'll want to do something like:
     *
     *   const blob = new Blob([buffer], { type: 'image/jpeg' })
     *   document.querySelector('#photo').src = URL.createObjectURL(blob)
     */
    resolve(src, onError) {
        if (typeof node_buffer.Buffer === 'function') {
            return node_buffer.Buffer.from(src, 'base64');
        }
        else if (typeof atob === 'function') {
            // On IE 11, atob() can't handle newlines
            const str = atob(src.replace(/[\n\r]/g, ''));
            const buffer = new Uint8Array(str.length);
            for (let i = 0; i < str.length; ++i)
                buffer[i] = str.charCodeAt(i);
            return buffer;
        }
        else {
            onError('This environment does not support reading binary tags; either Buffer or atob is required');
            return src;
        }
    },
    stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
            return '';
        const buf = value; // checked earlier by binary.identify()
        let str;
        if (typeof node_buffer.Buffer === 'function') {
            str =
                buf instanceof node_buffer.Buffer
                    ? buf.toString('base64')
                    : node_buffer.Buffer.from(buf.buffer).toString('base64');
        }
        else if (typeof btoa === 'function') {
            let s = '';
            for (let i = 0; i < buf.length; ++i)
                s += String.fromCharCode(buf[i]);
            str = btoa(s);
        }
        else {
            throw new Error('This environment does not support writing binary tags; either Buffer or btoa is required');
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
            const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
            const n = Math.ceil(str.length / lineWidth);
            const lines = new Array(n);
            for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
                lines[i] = str.substr(o, lineWidth);
            }
            str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? '\n' : ' ');
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
    }
};

exports.binary = binary;


/***/ }),

/***/ 3743:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);

function boolStringify({ value, source }, ctx) {
    const boolObj = value ? trueTag : falseTag;
    if (source && boolObj.test.test(source))
        return source;
    return value ? ctx.options.trueStr : ctx.options.falseStr;
}
const trueTag = {
    identify: value => value === true,
    default: true,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
    resolve: () => new Scalar.Scalar(true),
    stringify: boolStringify
};
const falseTag = {
    identify: value => value === false,
    default: true,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
    resolve: () => new Scalar.Scalar(false),
    stringify: boolStringify
};

exports.falseTag = falseTag;
exports.trueTag = trueTag;


/***/ }),

/***/ 6829:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);
var stringifyNumber = __nccwpck_require__(1002);

const floatNaN = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str) => str.slice(-3).toLowerCase() === 'nan'
        ? NaN
        : str[0] === '-'
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
};
const floatExp = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    format: 'EXP',
    test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
    resolve: (str) => parseFloat(str.replace(/_/g, '')),
    stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
};
const float = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
    resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, '')));
        const dot = str.indexOf('.');
        if (dot !== -1) {
            const f = str.substring(dot + 1).replace(/_/g, '');
            if (f[f.length - 1] === '0')
                node.minFractionDigits = f.length;
        }
        return node;
    },
    stringify: stringifyNumber.stringifyNumber
};

exports.float = float;
exports.floatExp = floatExp;
exports.floatNaN = floatNaN;


/***/ }),

/***/ 2458:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyNumber = __nccwpck_require__(1002);

const intIdentify = (value) => typeof value === 'bigint' || Number.isInteger(value);
function intResolve(str, offset, radix, { intAsBigInt }) {
    const sign = str[0];
    if (sign === '-' || sign === '+')
        offset += 1;
    str = str.substring(offset).replace(/_/g, '');
    if (intAsBigInt) {
        switch (radix) {
            case 2:
                str = `0b${str}`;
                break;
            case 8:
                str = `0o${str}`;
                break;
            case 16:
                str = `0x${str}`;
                break;
        }
        const n = BigInt(str);
        return sign === '-' ? BigInt(-1) * n : n;
    }
    const n = parseInt(str, radix);
    return sign === '-' ? -1 * n : n;
}
function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? '-' + prefix + str.substr(1) : prefix + str;
    }
    return stringifyNumber.stringifyNumber(node);
}
const intBin = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'BIN',
    test: /^[-+]?0b[0-1_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
    stringify: node => intStringify(node, 2, '0b')
};
const intOct = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'OCT',
    test: /^[-+]?0[0-7_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
    stringify: node => intStringify(node, 8, '0')
};
const int = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    test: /^[-+]?[0-9][0-9_]*$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
};
const intHex = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'HEX',
    test: /^[-+]?0x[0-9a-fA-F_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: node => intStringify(node, 16, '0x')
};

exports.int = int;
exports.intBin = intBin;
exports.intHex = intHex;
exports.intOct = intOct;


/***/ }),

/***/ 4067:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var Scalar = __nccwpck_require__(8732);

// If the value associated with a merge key is a single mapping node, each of
// its key/value pairs is inserted into the current mapping, unless the key
// already exists in it. If the value associated with the merge key is a
// sequence, then this sequence is expected to contain mapping nodes and each
// of these nodes is merged in turn according to its order in the sequence.
// Keys in mapping nodes earlier in the sequence override keys specified in
// later mapping nodes. -- http://yaml.org/type/merge.html
const MERGE_KEY = '<<';
const merge = {
    identify: value => value === MERGE_KEY ||
        (typeof value === 'symbol' && value.description === MERGE_KEY),
    default: 'key',
    tag: 'tag:yaml.org,2002:merge',
    test: /^<<$/,
    resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
    }),
    stringify: () => MERGE_KEY
};
const isMergeKey = (ctx, key) => (merge.identify(key) ||
    (identity.isScalar(key) &&
        (!key.type || key.type === Scalar.Scalar.PLAIN) &&
        merge.identify(key.value))) &&
    ctx?.doc.schema.tags.some(tag => tag.tag === merge.tag && tag.default);
function addMergeToJSMap(ctx, map, value) {
    const source = resolveAliasValue(ctx, value);
    if (identity.isSeq(source))
        for (const it of source.items)
            mergeValue(ctx, map, it);
    else if (Array.isArray(source))
        for (const it of source)
            mergeValue(ctx, map, it);
    else
        mergeValue(ctx, map, source);
}
function mergeValue(ctx, map, value) {
    const source = resolveAliasValue(ctx, value);
    if (!identity.isMap(source))
        throw new Error('Merge sources must be maps or map aliases');
    const srcMap = source.toJSON(null, ctx, Map);
    for (const [key, value] of srcMap) {
        if (map instanceof Map) {
            if (!map.has(key))
                map.set(key, value);
        }
        else if (map instanceof Set) {
            map.add(key);
        }
        else if (!Object.prototype.hasOwnProperty.call(map, key)) {
            Object.defineProperty(map, key, {
                value,
                writable: true,
                enumerable: true,
                configurable: true
            });
        }
    }
    return map;
}
function resolveAliasValue(ctx, value) {
    return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
}

exports.addMergeToJSMap = addMergeToJSMap;
exports.isMergeKey = isMergeKey;
exports.merge = merge;


/***/ }),

/***/ 3402:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var toJS = __nccwpck_require__(2150);
var YAMLMap = __nccwpck_require__(2613);
var YAMLSeq = __nccwpck_require__(3584);
var pairs = __nccwpck_require__(1270);

class YAMLOMap extends YAMLSeq.YAMLSeq {
    constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = YAMLOMap.tag;
    }
    /**
     * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
     * but TypeScript won't allow widening the signature of a child method.
     */
    toJSON(_, ctx) {
        if (!ctx)
            return super.toJSON(_);
        const map = new Map();
        if (ctx?.onCreate)
            ctx.onCreate(map);
        for (const pair of this.items) {
            let key, value;
            if (identity.isPair(pair)) {
                key = toJS.toJS(pair.key, '', ctx);
                value = toJS.toJS(pair.value, key, ctx);
            }
            else {
                key = toJS.toJS(pair, '', ctx);
            }
            if (map.has(key))
                throw new Error('Ordered maps must not include duplicate keys');
            map.set(key, value);
        }
        return map;
    }
    static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap = new this();
        omap.items = pairs$1.items;
        return omap;
    }
}
YAMLOMap.tag = 'tag:yaml.org,2002:omap';
const omap = {
    collection: 'seq',
    identify: value => value instanceof Map,
    nodeClass: YAMLOMap,
    default: false,
    tag: 'tag:yaml.org,2002:omap',
    resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
            if (identity.isScalar(key)) {
                if (seenKeys.includes(key.value)) {
                    onError(`Ordered maps must not include duplicate keys: ${key.value}`);
                }
                else {
                    seenKeys.push(key.value);
                }
            }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
    },
    createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
};

exports.YAMLOMap = YAMLOMap;
exports.omap = omap;


/***/ }),

/***/ 1270:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var Pair = __nccwpck_require__(7664);
var Scalar = __nccwpck_require__(8732);
var YAMLSeq = __nccwpck_require__(3584);

function resolvePairs(seq, onError) {
    if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
            let item = seq.items[i];
            if (identity.isPair(item))
                continue;
            else if (identity.isMap(item)) {
                if (item.items.length > 1)
                    onError('Each pair must have its own sequence indicator');
                const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
                if (item.commentBefore)
                    pair.key.commentBefore = pair.key.commentBefore
                        ? `${item.commentBefore}\n${pair.key.commentBefore}`
                        : item.commentBefore;
                if (item.comment) {
                    const cn = pair.value ?? pair.key;
                    cn.comment = cn.comment
                        ? `${item.comment}\n${cn.comment}`
                        : item.comment;
                }
                item = pair;
            }
            seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
    }
    else
        onError('Expected a sequence for this tag');
    return seq;
}
function createPairs(schema, iterable, ctx) {
    const { replacer } = ctx;
    const pairs = new YAMLSeq.YAMLSeq(schema);
    pairs.tag = 'tag:yaml.org,2002:pairs';
    let i = 0;
    if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
            if (typeof replacer === 'function')
                it = replacer.call(iterable, String(i++), it);
            let key, value;
            if (Array.isArray(it)) {
                if (it.length === 2) {
                    key = it[0];
                    value = it[1];
                }
                else
                    throw new TypeError(`Expected [key, value] tuple: ${it}`);
            }
            else if (it && it instanceof Object) {
                const keys = Object.keys(it);
                if (keys.length === 1) {
                    key = keys[0];
                    value = it[key];
                }
                else {
                    throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
                }
            }
            else {
                key = it;
            }
            pairs.items.push(Pair.createPair(key, value, ctx));
        }
    return pairs;
}
const pairs = {
    collection: 'seq',
    default: false,
    tag: 'tag:yaml.org,2002:pairs',
    resolve: resolvePairs,
    createNode: createPairs
};

exports.createPairs = createPairs;
exports.pairs = pairs;
exports.resolvePairs = resolvePairs;


/***/ }),

/***/ 6632:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var map = __nccwpck_require__(4912);
var _null = __nccwpck_require__(5257);
var seq = __nccwpck_require__(2085);
var string = __nccwpck_require__(5025);
var binary = __nccwpck_require__(9638);
var bool = __nccwpck_require__(3743);
var float = __nccwpck_require__(6829);
var int = __nccwpck_require__(2458);
var merge = __nccwpck_require__(4067);
var omap = __nccwpck_require__(3402);
var pairs = __nccwpck_require__(1270);
var set = __nccwpck_require__(5871);
var timestamp = __nccwpck_require__(3687);

const schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.trueTag,
    bool.falseTag,
    int.intBin,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float,
    binary.binary,
    merge.merge,
    omap.omap,
    pairs.pairs,
    set.set,
    timestamp.intTime,
    timestamp.floatTime,
    timestamp.timestamp
];

exports.schema = schema;


/***/ }),

/***/ 5871:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var Pair = __nccwpck_require__(7664);
var YAMLMap = __nccwpck_require__(2613);

class YAMLSet extends YAMLMap.YAMLMap {
    constructor(schema) {
        super(schema);
        this.tag = YAMLSet.tag;
    }
    add(key) {
        let pair;
        if (identity.isPair(key))
            pair = key;
        else if (key &&
            typeof key === 'object' &&
            'key' in key &&
            'value' in key &&
            key.value === null)
            pair = new Pair.Pair(key.key, null);
        else
            pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
            this.items.push(pair);
    }
    /**
     * If `keepPair` is `true`, returns the Pair matching `key`.
     * Otherwise, returns the value of that Pair's key.
     */
    get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair)
            ? identity.isScalar(pair.key)
                ? pair.key.value
                : pair.key
            : pair;
    }
    set(key, value) {
        if (typeof value !== 'boolean')
            throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
            this.items.splice(this.items.indexOf(prev), 1);
        }
        else if (!prev && value) {
            this.items.push(new Pair.Pair(key));
        }
    }
    toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
    }
    toString(ctx, onComment, onChompKeep) {
        if (!ctx)
            return JSON.stringify(this);
        if (this.hasAllNullValues(true))
            return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
            throw new Error('Set items must all have null values');
    }
    static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
            for (let value of iterable) {
                if (typeof replacer === 'function')
                    value = replacer.call(iterable, value, value);
                set.items.push(Pair.createPair(value, null, ctx));
            }
        return set;
    }
}
YAMLSet.tag = 'tag:yaml.org,2002:set';
const set = {
    collection: 'map',
    identify: value => value instanceof Set,
    nodeClass: YAMLSet,
    default: false,
    tag: 'tag:yaml.org,2002:set',
    createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
    resolve(map, onError) {
        if (identity.isMap(map)) {
            if (map.hasAllNullValues(true))
                return Object.assign(new YAMLSet(), map);
            else
                onError('Set items must all have null values');
        }
        else
            onError('Expected a mapping for this tag');
        return map;
    }
};

exports.YAMLSet = YAMLSet;
exports.set = set;


/***/ }),

/***/ 3687:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyNumber = __nccwpck_require__(1002);

/** Internal types handle bigint as number, because TS can't figure it out. */
function parseSexagesimal(str, asBigInt) {
    const sign = str[0];
    const parts = sign === '-' || sign === '+' ? str.substring(1) : str;
    const num = (n) => asBigInt ? BigInt(n) : Number(n);
    const res = parts
        .replace(/_/g, '')
        .split(':')
        .reduce((res, p) => res * num(60) + num(p), num(0));
    return (sign === '-' ? num(-1) * res : res);
}
/**
 * hhhh:mm:ss.sss
 *
 * Internal types handle bigint as number, because TS can't figure it out.
 */
function stringifySexagesimal(node) {
    let { value } = node;
    let num = (n) => n;
    if (typeof value === 'bigint')
        num = n => BigInt(n);
    else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
    let sign = '';
    if (value < 0) {
        sign = '-';
        value *= num(-1);
    }
    const _60 = num(60);
    const parts = [value % _60]; // seconds, including ms
    if (value < 60) {
        parts.unshift(0); // at least one : is required
    }
    else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60); // minutes
        if (value >= 60) {
            value = (value - parts[0]) / _60;
            parts.unshift(value); // hours
        }
    }
    return (sign +
        parts
            .map(n => String(n).padStart(2, '0'))
            .join(':')
            .replace(/000000\d*$/, '') // % 60 may introduce error
    );
}
const intTime = {
    identify: value => typeof value === 'bigint' || Number.isInteger(value),
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'TIME',
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
    resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
    stringify: stringifySexagesimal
};
const floatTime = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    format: 'TIME',
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
    resolve: str => parseSexagesimal(str, false),
    stringify: stringifySexagesimal
};
const timestamp = {
    identify: value => value instanceof Date,
    default: true,
    tag: 'tag:yaml.org,2002:timestamp',
    // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
    // may be omitted altogether, resulting in a date format. In such a case, the time part is
    // assumed to be 00:00:00Z (start of day, UTC).
    test: RegExp('^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})' + // YYYY-Mm-Dd
        '(?:' + // time is optional
        '(?:t|T|[ \\t]+)' + // t | T | whitespace
        '([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)' + // Hh:Mm:Ss(.ss)?
        '(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?' + // Z | +5 | -03:30
        ')?$'),
    resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
            throw new Error('!!timestamp expects a date, starting with yyyy-mm-dd');
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + '00').substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== 'Z') {
            let d = parseSexagesimal(tz, false);
            if (Math.abs(d) < 30)
                d *= 60;
            date -= 60000 * d;
        }
        return new Date(date);
    },
    stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, '') ?? ''
};

exports.floatTime = floatTime;
exports.intTime = intTime;
exports.timestamp = timestamp;


/***/ }),

/***/ 7832:
/***/ ((__unused_webpack_module, exports) => {



const FOLD_FLOW = 'flow';
const FOLD_BLOCK = 'block';
const FOLD_QUOTED = 'quoted';
/**
 * Tries to keep input at up to `lineWidth` characters, splitting only on spaces
 * not followed by newlines or spaces unless `mode` is `'quoted'`. Lines are
 * terminated with `\n` and started with `indent`.
 */
function foldFlowLines(text, indent, mode = 'flow', { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
    if (!lineWidth || lineWidth < 0)
        return text;
    if (lineWidth < minContentWidth)
        minContentWidth = 0;
    const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
    if (text.length <= endStep)
        return text;
    const folds = [];
    const escapedFolds = {};
    let end = lineWidth - indent.length;
    if (typeof indentAtStart === 'number') {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
            folds.push(0);
        else
            end = lineWidth - indentAtStart;
    }
    let split = undefined;
    let prev = undefined;
    let overflow = false;
    let i = -1;
    let escStart = -1;
    let escEnd = -1;
    if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
            end = i + endStep;
    }
    for (let ch; (ch = text[(i += 1)]);) {
        if (mode === FOLD_QUOTED && ch === '\\') {
            escStart = i;
            switch (text[i + 1]) {
                case 'x':
                    i += 3;
                    break;
                case 'u':
                    i += 5;
                    break;
                case 'U':
                    i += 9;
                    break;
                default:
                    i += 1;
            }
            escEnd = i;
        }
        if (ch === '\n') {
            if (mode === FOLD_BLOCK)
                i = consumeMoreIndentedLines(text, i, indent.length);
            end = i + indent.length + endStep;
            split = undefined;
        }
        else {
            if (ch === ' ' &&
                prev &&
                prev !== ' ' &&
                prev !== '\n' &&
                prev !== '\t') {
                // space surrounded by non-space can be replaced with newline + indent
                const next = text[i + 1];
                if (next && next !== ' ' && next !== '\n' && next !== '\t')
                    split = i;
            }
            if (i >= end) {
                if (split) {
                    folds.push(split);
                    end = split + endStep;
                    split = undefined;
                }
                else if (mode === FOLD_QUOTED) {
                    // white-space collected at end may stretch past lineWidth
                    while (prev === ' ' || prev === '\t') {
                        prev = ch;
                        ch = text[(i += 1)];
                        overflow = true;
                    }
                    // Account for newline escape, but don't break preceding escape
                    const j = i > escEnd + 1 ? i - 2 : escStart - 1;
                    // Bail out if lineWidth & minContentWidth are shorter than an escape string
                    if (escapedFolds[j])
                        return text;
                    folds.push(j);
                    escapedFolds[j] = true;
                    end = j + endStep;
                    split = undefined;
                }
                else {
                    overflow = true;
                }
            }
        }
        prev = ch;
    }
    if (overflow && onOverflow)
        onOverflow();
    if (folds.length === 0)
        return text;
    if (onFold)
        onFold();
    let res = text.slice(0, folds[0]);
    for (let i = 0; i < folds.length; ++i) {
        const fold = folds[i];
        const end = folds[i + 1] || text.length;
        if (fold === 0)
            res = `\n${indent}${text.slice(0, end)}`;
        else {
            if (mode === FOLD_QUOTED && escapedFolds[fold])
                res += `${text[fold]}\\`;
            res += `\n${indent}${text.slice(fold + 1, end)}`;
        }
    }
    return res;
}
/**
 * Presumes `i + 1` is at the start of a line
 * @returns index of last newline in more-indented block
 */
function consumeMoreIndentedLines(text, i, indent) {
    let end = i;
    let start = i + 1;
    let ch = text[start];
    while (ch === ' ' || ch === '\t') {
        if (i < start + indent) {
            ch = text[++i];
        }
        else {
            do {
                ch = text[++i];
            } while (ch && ch !== '\n');
            end = i;
            start = i + 1;
            ch = text[start];
        }
    }
    return end;
}

exports.FOLD_BLOCK = FOLD_BLOCK;
exports.FOLD_FLOW = FOLD_FLOW;
exports.FOLD_QUOTED = FOLD_QUOTED;
exports.foldFlowLines = foldFlowLines;


/***/ }),

/***/ 7727:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var anchors = __nccwpck_require__(7407);
var identity = __nccwpck_require__(3662);
var stringifyComment = __nccwpck_require__(4910);
var stringifyString = __nccwpck_require__(5098);

function createStringifyContext(doc, options) {
    const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: 'PLAIN',
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: 'false',
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: 'null',
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: 'true',
        verifyAliasOrder: true
    }, doc.schema.toStringOptions, options);
    let inFlow;
    switch (opt.collectionStyle) {
        case 'block':
            inFlow = false;
            break;
        case 'flow':
            inFlow = true;
            break;
        default:
            inFlow = null;
    }
    return {
        anchors: new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? ' ' : '',
        indent: '',
        indentStep: typeof opt.indent === 'number' ? ' '.repeat(opt.indent) : '  ',
        inFlow,
        options: opt
    };
}
function getTagObject(tags, item) {
    if (item.tag) {
        const match = tags.filter(t => t.tag === item.tag);
        if (match.length > 0)
            return match.find(t => t.format === item.format) ?? match[0];
    }
    let tagObj = undefined;
    let obj;
    if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter(t => t.identify?.(obj));
        if (match.length > 1) {
            const testMatch = match.filter(t => t.test);
            if (testMatch.length > 0)
                match = testMatch;
        }
        tagObj =
            match.find(t => t.format === item.format) ?? match.find(t => !t.format);
    }
    else {
        obj = item;
        tagObj = tags.find(t => t.nodeClass && obj instanceof t.nodeClass);
    }
    if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? 'null' : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
    }
    return tagObj;
}
// needs to be called before value stringifier to allow for circular anchor refs
function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
    if (!doc.directives)
        return '';
    const props = [];
    const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
    if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
    }
    const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
    if (tag)
        props.push(doc.directives.tagString(tag));
    return props.join(' ');
}
function stringify(item, ctx, onComment, onChompKeep) {
    if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
    if (identity.isAlias(item)) {
        if (ctx.doc.directives)
            return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
            throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        }
        else {
            if (ctx.resolvedAliases)
                ctx.resolvedAliases.add(item);
            else
                ctx.resolvedAliases = new Set([item]);
            item = item.resolve(ctx.doc);
        }
    }
    let tagObj = undefined;
    const node = identity.isNode(item)
        ? item
        : ctx.doc.createNode(item, { onTagObj: o => (tagObj = o) });
    tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
    const props = stringifyProps(node, tagObj, ctx);
    if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
    const str = typeof tagObj.stringify === 'function'
        ? tagObj.stringify(node, ctx, onComment, onChompKeep)
        : identity.isScalar(node)
            ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep)
            : node.toString(ctx, onComment, onChompKeep);
    if (!props)
        return str;
    return identity.isScalar(node) || str[0] === '{' || str[0] === '['
        ? `${props} ${str}`
        : `${props}\n${ctx.indent}${str}`;
}

exports.createStringifyContext = createStringifyContext;
exports.stringify = stringify;


/***/ }),

/***/ 3803:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var stringify = __nccwpck_require__(7727);
var stringifyComment = __nccwpck_require__(4910);

function stringifyCollection(collection, ctx, options) {
    const flow = ctx.inFlow ?? collection.flow;
    const stringify = flow ? stringifyFlowCollection : stringifyBlockCollection;
    return stringify(collection, ctx, options);
}
function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
    const { indent, options: { commentString } } = ctx;
    const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
    let chompKeep = false; // flag for the preceding node's status
    const lines = [];
    for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
            if (!chompKeep && item.spaceBefore)
                lines.push('');
            addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
            if (item.comment)
                comment = item.comment;
        }
        else if (identity.isPair(item)) {
            const ik = identity.isNode(item.key) ? item.key : null;
            if (ik) {
                if (!chompKeep && ik.spaceBefore)
                    lines.push('');
                addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
            }
        }
        chompKeep = false;
        let str = stringify.stringify(item, itemCtx, () => (comment = null), () => (chompKeep = true));
        if (comment)
            str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        if (chompKeep && comment)
            chompKeep = false;
        lines.push(blockItemPrefix + str);
    }
    let str;
    if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
    }
    else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
            const line = lines[i];
            str += line ? `\n${indent}${line}` : '\n';
        }
    }
    if (comment) {
        str += '\n' + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
            onComment();
    }
    else if (chompKeep && onChompKeep)
        onChompKeep();
    return str;
}
function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
    const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
    itemIndent += indentStep;
    const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
    });
    let reqNewline = false;
    let linesAtValue = 0;
    const lines = [];
    for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
            if (item.spaceBefore)
                lines.push('');
            addCommentBefore(ctx, lines, item.commentBefore, false);
            if (item.comment)
                comment = item.comment;
        }
        else if (identity.isPair(item)) {
            const ik = identity.isNode(item.key) ? item.key : null;
            if (ik) {
                if (ik.spaceBefore)
                    lines.push('');
                addCommentBefore(ctx, lines, ik.commentBefore, false);
                if (ik.comment)
                    reqNewline = true;
            }
            const iv = identity.isNode(item.value) ? item.value : null;
            if (iv) {
                if (iv.comment)
                    comment = iv.comment;
                if (iv.commentBefore)
                    reqNewline = true;
            }
            else if (item.value == null && ik?.comment) {
                comment = ik.comment;
            }
        }
        if (comment)
            reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => (comment = null));
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes('\n'));
        if (i < items.length - 1) {
            str += ',';
        }
        else if (ctx.options.trailingComma) {
            if (ctx.options.lineWidth > 0) {
                reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) +
                    (str.length + 2) >
                    ctx.options.lineWidth);
            }
            if (reqNewline) {
                str += ',';
            }
        }
        if (comment)
            str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
    }
    const { start, end } = flowChars;
    if (lines.length === 0) {
        return start + end;
    }
    else {
        if (!reqNewline) {
            const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
            reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
            let str = start;
            for (const line of lines)
                str += line ? `\n${indentStep}${indent}${line}` : '\n';
            return `${str}\n${indent}${end}`;
        }
        else {
            return `${start}${fcPadding}${lines.join(' ')}${fcPadding}${end}`;
        }
    }
}
function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
    if (comment && chompKeep)
        comment = comment.replace(/^\n+/, '');
    if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart()); // Avoid double indent on first line
    }
}

exports.stringifyCollection = stringifyCollection;


/***/ }),

/***/ 4910:
/***/ ((__unused_webpack_module, exports) => {



/**
 * Stringifies a comment.
 *
 * Empty comment lines are left empty,
 * lines consisting of a single space are replaced by `#`,
 * and all other lines are prefixed with a `#`.
 */
const stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, '#');
function indentComment(comment, indent) {
    if (/^\n+$/.test(comment))
        return comment.substring(1);
    return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
}
const lineComment = (str, indent, comment) => str.endsWith('\n')
    ? indentComment(comment, indent)
    : comment.includes('\n')
        ? '\n' + indentComment(comment, indent)
        : (str.endsWith(' ') ? '' : ' ') + comment;

exports.indentComment = indentComment;
exports.lineComment = lineComment;
exports.stringifyComment = stringifyComment;


/***/ }),

/***/ 1994:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var stringify = __nccwpck_require__(7727);
var stringifyComment = __nccwpck_require__(4910);

function stringifyDocument(doc, options) {
    const lines = [];
    let hasDirectives = options.directives === true;
    if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
            lines.push(dir);
            hasDirectives = true;
        }
        else if (doc.directives.docStart)
            hasDirectives = true;
    }
    if (hasDirectives)
        lines.push('---');
    const ctx = stringify.createStringifyContext(doc, options);
    const { commentString } = ctx.options;
    if (doc.commentBefore) {
        if (lines.length !== 1)
            lines.unshift('');
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ''));
    }
    let chompKeep = false;
    let contentComment = null;
    if (doc.contents) {
        if (identity.isNode(doc.contents)) {
            if (doc.contents.spaceBefore && hasDirectives)
                lines.push('');
            if (doc.contents.commentBefore) {
                const cs = commentString(doc.contents.commentBefore);
                lines.push(stringifyComment.indentComment(cs, ''));
            }
            // top-level block scalars need to be indented if followed by a comment
            ctx.forceBlockIndent = !!doc.comment;
            contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? undefined : () => (chompKeep = true);
        let body = stringify.stringify(doc.contents, ctx, () => (contentComment = null), onChompKeep);
        if (contentComment)
            body += stringifyComment.lineComment(body, '', commentString(contentComment));
        if ((body[0] === '|' || body[0] === '>') &&
            lines[lines.length - 1] === '---') {
            // Top-level block scalars with a preceding doc marker ought to use the
            // same line for their header.
            lines[lines.length - 1] = `--- ${body}`;
        }
        else
            lines.push(body);
    }
    else {
        lines.push(stringify.stringify(doc.contents, ctx));
    }
    if (doc.directives?.docEnd) {
        if (doc.comment) {
            const cs = commentString(doc.comment);
            if (cs.includes('\n')) {
                lines.push('...');
                lines.push(stringifyComment.indentComment(cs, ''));
            }
            else {
                lines.push(`... ${cs}`);
            }
        }
        else {
            lines.push('...');
        }
    }
    else {
        let dc = doc.comment;
        if (dc && chompKeep)
            dc = dc.replace(/^\n+/, '');
        if (dc) {
            if ((!chompKeep || contentComment) && lines[lines.length - 1] !== '')
                lines.push('');
            lines.push(stringifyComment.indentComment(commentString(dc), ''));
        }
    }
    return lines.join('\n') + '\n';
}

exports.stringifyDocument = stringifyDocument;


/***/ }),

/***/ 1002:
/***/ ((__unused_webpack_module, exports) => {



function stringifyNumber({ format, minFractionDigits, tag, value }) {
    if (typeof value === 'bigint')
        return String(value);
    const num = typeof value === 'number' ? value : Number(value);
    if (!isFinite(num))
        return isNaN(num) ? '.nan' : num < 0 ? '-.inf' : '.inf';
    let n = Object.is(value, -0) ? '-0' : JSON.stringify(value);
    if (!format &&
        minFractionDigits &&
        (!tag || tag === 'tag:yaml.org,2002:float') &&
        /^-?\d/.test(n) &&
        !n.includes('e')) {
        let i = n.indexOf('.');
        if (i < 0) {
            i = n.length;
            n += '.';
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
            n += '0';
    }
    return n;
}

exports.stringifyNumber = stringifyNumber;


/***/ }),

/***/ 2043:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);
var Scalar = __nccwpck_require__(8732);
var stringify = __nccwpck_require__(7727);
var stringifyComment = __nccwpck_require__(4910);

function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
    const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
    let keyComment = (identity.isNode(key) && key.comment) || null;
    if (simpleKeys) {
        if (keyComment) {
            throw new Error('With simple keys, key nodes cannot have comments');
        }
        if (identity.isCollection(key) || (!identity.isNode(key) && typeof key === 'object')) {
            const msg = 'With simple keys, collection cannot be used as a key value';
            throw new Error(msg);
        }
    }
    let explicitKey = !simpleKeys &&
        (!key ||
            (keyComment && value == null && !ctx.inFlow) ||
            identity.isCollection(key) ||
            (identity.isScalar(key)
                ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL
                : typeof key === 'object'));
    ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
    });
    let keyCommentDone = false;
    let chompKeep = false;
    let str = stringify.stringify(key, ctx, () => (keyCommentDone = true), () => (chompKeep = true));
    if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
            throw new Error('With simple keys, single line scalar must not span more than 1024 characters');
        explicitKey = true;
    }
    if (ctx.inFlow) {
        if (allNullValues || value == null) {
            if (keyCommentDone && onComment)
                onComment();
            return str === '' ? '?' : explicitKey ? `? ${str}` : str;
        }
    }
    else if ((allNullValues && !simpleKeys) || (value == null && explicitKey)) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
            str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        }
        else if (chompKeep && onChompKeep)
            onChompKeep();
        return str;
    }
    if (keyCommentDone)
        keyComment = null;
    if (explicitKey) {
        if (keyComment)
            str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}\n${indent}:`;
    }
    else {
        str = `${str}:`;
        if (keyComment)
            str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
    }
    let vsb, vcb, valueComment;
    if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
    }
    else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === 'object')
            value = doc.createNode(value);
    }
    ctx.implicitKey = false;
    if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
    chompKeep = false;
    if (!indentSeq &&
        indentStep.length >= 2 &&
        !ctx.inFlow &&
        !explicitKey &&
        identity.isSeq(value) &&
        !value.flow &&
        !value.tag &&
        !value.anchor) {
        // If indentSeq === false, consider '- ' as part of indentation where possible
        ctx.indent = ctx.indent.substring(2);
    }
    let valueCommentDone = false;
    const valueStr = stringify.stringify(value, ctx, () => (valueCommentDone = true), () => (chompKeep = true));
    let ws = ' ';
    if (keyComment || vsb || vcb) {
        ws = vsb ? '\n' : '';
        if (vcb) {
            const cs = commentString(vcb);
            ws += `\n${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === '' && !ctx.inFlow) {
            if (ws === '\n' && valueComment)
                ws = '\n\n';
        }
        else {
            ws += `\n${ctx.indent}`;
        }
    }
    else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf('\n');
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
            let hasPropsLine = false;
            if (hasNewline && (vs0 === '&' || vs0 === '!')) {
                let sp0 = valueStr.indexOf(' ');
                if (vs0 === '&' &&
                    sp0 !== -1 &&
                    sp0 < nl0 &&
                    valueStr[sp0 + 1] === '!') {
                    sp0 = valueStr.indexOf(' ', sp0 + 1);
                }
                if (sp0 === -1 || nl0 < sp0)
                    hasPropsLine = true;
            }
            if (!hasPropsLine)
                ws = `\n${ctx.indent}`;
        }
    }
    else if (valueStr === '' || valueStr[0] === '\n') {
        ws = '';
    }
    str += ws + valueStr;
    if (ctx.inFlow) {
        if (valueCommentDone && onComment)
            onComment();
    }
    else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
    }
    else if (chompKeep && onChompKeep) {
        onChompKeep();
    }
    return str;
}

exports.stringifyPair = stringifyPair;


/***/ }),

/***/ 5098:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(8732);
var foldFlowLines = __nccwpck_require__(7832);

const getFoldOptions = (ctx, isBlock) => ({
    indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
    lineWidth: ctx.options.lineWidth,
    minContentWidth: ctx.options.minContentWidth
});
// Also checks for lines starting with %, as parsing the output as YAML 1.1 will
// presume that's starting a new document.
const containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
function lineLengthOverLimit(str, lineWidth, indentLength) {
    if (!lineWidth || lineWidth < 0)
        return false;
    const limit = lineWidth - indentLength;
    const strLen = str.length;
    if (strLen <= limit)
        return false;
    for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === '\n') {
            if (i - start > limit)
                return true;
            start = i + 1;
            if (strLen - start <= limit)
                return false;
        }
    }
    return true;
}
function doubleQuotedString(value, ctx) {
    const json = JSON.stringify(value);
    if (ctx.options.doubleQuotedAsJSON)
        return json;
    const { implicitKey } = ctx;
    const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
    const indent = ctx.indent || (containsDocumentMarker(value) ? '  ' : '');
    let str = '';
    let start = 0;
    for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === ' ' && json[i + 1] === '\\' && json[i + 2] === 'n') {
            // space before newline needs to be escaped to not be folded
            str += json.slice(start, i) + '\\ ';
            i += 1;
            start = i;
            ch = '\\';
        }
        if (ch === '\\')
            switch (json[i + 1]) {
                case 'u':
                    {
                        str += json.slice(start, i);
                        const code = json.substr(i + 2, 4);
                        switch (code) {
                            case '0000':
                                str += '\\0';
                                break;
                            case '0007':
                                str += '\\a';
                                break;
                            case '000b':
                                str += '\\v';
                                break;
                            case '001b':
                                str += '\\e';
                                break;
                            case '0085':
                                str += '\\N';
                                break;
                            case '00a0':
                                str += '\\_';
                                break;
                            case '2028':
                                str += '\\L';
                                break;
                            case '2029':
                                str += '\\P';
                                break;
                            default:
                                if (code.substr(0, 2) === '00')
                                    str += '\\x' + code.substr(2);
                                else
                                    str += json.substr(i, 6);
                        }
                        i += 5;
                        start = i + 1;
                    }
                    break;
                case 'n':
                    if (implicitKey ||
                        json[i + 2] === '"' ||
                        json.length < minMultiLineLength) {
                        i += 1;
                    }
                    else {
                        // folding will eat first newline
                        str += json.slice(start, i) + '\n\n';
                        while (json[i + 2] === '\\' &&
                            json[i + 3] === 'n' &&
                            json[i + 4] !== '"') {
                            str += '\n';
                            i += 2;
                        }
                        str += indent;
                        // space after newline needs to be escaped to not be folded
                        if (json[i + 2] === ' ')
                            str += '\\';
                        i += 1;
                        start = i + 1;
                    }
                    break;
                default:
                    i += 1;
            }
    }
    str = start ? str + json.slice(start) : json;
    return implicitKey
        ? str
        : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
}
function singleQuotedString(value, ctx) {
    if (ctx.options.singleQuote === false ||
        (ctx.implicitKey && value.includes('\n')) ||
        /[ \t]\n|\n[ \t]/.test(value) // single quoted string can't have leading or trailing whitespace around newline
    )
        return doubleQuotedString(value, ctx);
    const indent = ctx.indent || (containsDocumentMarker(value) ? '  ' : '');
    const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&\n${indent}`) + "'";
    return ctx.implicitKey
        ? res
        : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
}
function quotedString(value, ctx) {
    const { singleQuote } = ctx.options;
    let qs;
    if (singleQuote === false)
        qs = doubleQuotedString;
    else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
            qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
            qs = doubleQuotedString;
        else
            qs = singleQuote ? singleQuotedString : doubleQuotedString;
    }
    return qs(value, ctx);
}
// The negative lookbehind avoids a polynomial search,
// but isn't supported yet on Safari: https://caniuse.com/js-regexp-lookbehind
let blockEndNewlines;
try {
    blockEndNewlines = new RegExp('(^|(?<!\n))\n+(?!\n|$)', 'g');
}
catch {
    blockEndNewlines = /\n+(?!\n|$)/g;
}
function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
    const { blockQuote, commentString, lineWidth } = ctx.options;
    // 1. Block can't end in whitespace unless the last line is non-empty.
    // 2. Strings consisting of only whitespace are best rendered explicitly.
    if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
    }
    const indent = ctx.indent ||
        (ctx.forceBlockIndent || containsDocumentMarker(value) ? '  ' : '');
    const literal = blockQuote === 'literal'
        ? true
        : blockQuote === 'folded' || type === Scalar.Scalar.BLOCK_FOLDED
            ? false
            : type === Scalar.Scalar.BLOCK_LITERAL
                ? true
                : !lineLengthOverLimit(value, lineWidth, indent.length);
    if (!value)
        return literal ? '|\n' : '>\n';
    // determine chomping from whitespace at value end
    let chomp;
    let endStart;
    for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== '\n' && ch !== '\t' && ch !== ' ')
            break;
    }
    let end = value.substring(endStart);
    const endNlPos = end.indexOf('\n');
    if (endNlPos === -1) {
        chomp = '-'; // strip
    }
    else if (value === end || endNlPos !== end.length - 1) {
        chomp = '+'; // keep
        if (onChompKeep)
            onChompKeep();
    }
    else {
        chomp = ''; // clip
    }
    if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === '\n')
            end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
    }
    // determine indent indicator from whitespace at value start
    let startWithSpace = false;
    let startEnd;
    let startNlPos = -1;
    for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === ' ')
            startWithSpace = true;
        else if (ch === '\n')
            startNlPos = startEnd;
        else
            break;
    }
    let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
    if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
    }
    const indentSize = indent ? '2' : '1'; // root is at -1
    // Leading | or > is added later
    let header = (startWithSpace ? indentSize : '') + chomp;
    if (comment) {
        header += ' ' + commentString(comment.replace(/ ?[\r\n]+/g, ' '));
        if (onComment)
            onComment();
    }
    if (!literal) {
        const foldedValue = value
            .replace(/\n+/g, '\n$&')
            .replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, '$1$2') // more-indented lines aren't folded
            //                ^ more-ind. ^ empty     ^ capture next empty lines only at end of indent
            .replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== 'folded' && type !== Scalar.Scalar.BLOCK_FOLDED) {
            foldOptions.onOverflow = () => {
                literalFallback = true;
            };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
            return `>${header}\n${indent}${body}`;
    }
    value = value.replace(/\n+/g, `$&${indent}`);
    return `|${header}\n${indent}${start}${value}${end}`;
}
function plainString(item, ctx, onComment, onChompKeep) {
    const { type, value } = item;
    const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
    if ((implicitKey && value.includes('\n')) ||
        (inFlow && /[[\]{},]/.test(value))) {
        return quotedString(value, ctx);
    }
    if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        // not allowed:
        // - '-' or '?'
        // - start with an indicator character (except [?:-]) or /[?-] /
        // - '\n ', ': ' or ' \n' anywhere
        // - '#' not preceded by a non-space char
        // - end with ' ' or ':'
        return implicitKey || inFlow || !value.includes('\n')
            ? quotedString(value, ctx)
            : blockString(item, ctx, onComment, onChompKeep);
    }
    if (!implicitKey &&
        !inFlow &&
        type !== Scalar.Scalar.PLAIN &&
        value.includes('\n')) {
        // Where allowed & type not set explicitly, prefer block style for multiline strings
        return blockString(item, ctx, onComment, onChompKeep);
    }
    if (containsDocumentMarker(value)) {
        if (indent === '') {
            ctx.forceBlockIndent = true;
            return blockString(item, ctx, onComment, onChompKeep);
        }
        else if (implicitKey && indent === indentStep) {
            return quotedString(value, ctx);
        }
    }
    const str = value.replace(/\n+/g, `$&\n${indent}`);
    // Verify that output will be parsed as a string, as e.g. plain numbers and
    // booleans get parsed with those types in v1.2 (e.g. '42', 'true' & '0.9e-3'),
    // and others in v1.1.
    if (actualString) {
        const test = (tag) => tag.default && tag.tag !== 'tag:yaml.org,2002:str' && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
            return quotedString(value, ctx);
    }
    return implicitKey
        ? str
        : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
}
function stringifyString(item, ctx, onComment, onChompKeep) {
    const { implicitKey, inFlow } = ctx;
    const ss = typeof item.value === 'string'
        ? item
        : Object.assign({}, item, { value: String(item.value) });
    let { type } = item;
    if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        // force double quotes on control characters & unpaired surrogates
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
            type = Scalar.Scalar.QUOTE_DOUBLE;
    }
    const _stringify = (_type) => {
        switch (_type) {
            case Scalar.Scalar.BLOCK_FOLDED:
            case Scalar.Scalar.BLOCK_LITERAL:
                return implicitKey || inFlow
                    ? quotedString(ss.value, ctx) // blocks are not valid inside flow containers
                    : blockString(ss, ctx, onComment, onChompKeep);
            case Scalar.Scalar.QUOTE_DOUBLE:
                return doubleQuotedString(ss.value, ctx);
            case Scalar.Scalar.QUOTE_SINGLE:
                return singleQuotedString(ss.value, ctx);
            case Scalar.Scalar.PLAIN:
                return plainString(ss, ctx, onComment, onChompKeep);
            default:
                return null;
        }
    };
    let res = _stringify(type);
    if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = (implicitKey && defaultKeyType) || defaultStringType;
        res = _stringify(t);
        if (res === null)
            throw new Error(`Unsupported default string type ${t}`);
    }
    return res;
}

exports.stringifyString = stringifyString;


/***/ }),

/***/ 2727:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(3662);

const BREAK = Symbol('break visit');
const SKIP = Symbol('skip children');
const REMOVE = Symbol('remove node');
/**
 * Apply a visitor to an AST node or document.
 *
 * Walks through the tree (depth-first) starting from `node`, calling a
 * `visitor` function with three arguments:
 *   - `key`: For sequence values and map `Pair`, the node's index in the
 *     collection. Within a `Pair`, `'key'` or `'value'`, correspondingly.
 *     `null` for the root node.
 *   - `node`: The current node.
 *   - `path`: The ancestry of the current node.
 *
 * The return value of the visitor may be used to control the traversal:
 *   - `undefined` (default): Do nothing and continue
 *   - `visit.SKIP`: Do not visit the children of this node, continue with next
 *     sibling
 *   - `visit.BREAK`: Terminate traversal completely
 *   - `visit.REMOVE`: Remove the current node, then continue with the next one
 *   - `Node`: Replace the current node, then continue by visiting it
 *   - `number`: While iterating the items of a sequence or map, set the index
 *     of the next step. This is useful especially if the index of the current
 *     node has changed.
 *
 * If `visitor` is a single function, it will be called with all values
 * encountered in the tree, including e.g. `null` values. Alternatively,
 * separate visitor functions may be defined for each `Map`, `Pair`, `Seq`,
 * `Alias` and `Scalar` node. To define the same visitor function for more than
 * one node type, use the `Collection` (map and seq), `Value` (map, seq & scalar)
 * and `Node` (alias, map, seq & scalar) targets. Of all these, only the most
 * specific defined one will be used for each node.
 */
function visit(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
            node.contents = null;
    }
    else
        visit_(null, node, visitor_, Object.freeze([]));
}
// Without the `as symbol` casts, TS declares these in the `visit`
// namespace using `var`, but then complains about that because
// `unique symbol` must be `const`.
/** Terminate visit traversal completely */
visit.BREAK = BREAK;
/** Do not visit the children of the current node */
visit.SKIP = SKIP;
/** Remove the current node */
visit.REMOVE = REMOVE;
function visit_(key, node, visitor, path) {
    const ctrl = callVisitor(key, node, visitor, path);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== 'symbol') {
        if (identity.isCollection(node)) {
            path = Object.freeze(path.concat(node));
            for (let i = 0; i < node.items.length; ++i) {
                const ci = visit_(i, node.items[i], visitor, path);
                if (typeof ci === 'number')
                    i = ci - 1;
                else if (ci === BREAK)
                    return BREAK;
                else if (ci === REMOVE) {
                    node.items.splice(i, 1);
                    i -= 1;
                }
            }
        }
        else if (identity.isPair(node)) {
            path = Object.freeze(path.concat(node));
            const ck = visit_('key', node.key, visitor, path);
            if (ck === BREAK)
                return BREAK;
            else if (ck === REMOVE)
                node.key = null;
            const cv = visit_('value', node.value, visitor, path);
            if (cv === BREAK)
                return BREAK;
            else if (cv === REMOVE)
                node.value = null;
        }
    }
    return ctrl;
}
/**
 * Apply an async visitor to an AST node or document.
 *
 * Walks through the tree (depth-first) starting from `node`, calling a
 * `visitor` function with three arguments:
 *   - `key`: For sequence values and map `Pair`, the node's index in the
 *     collection. Within a `Pair`, `'key'` or `'value'`, correspondingly.
 *     `null` for the root node.
 *   - `node`: The current node.
 *   - `path`: The ancestry of the current node.
 *
 * The return value of the visitor may be used to control the traversal:
 *   - `Promise`: Must resolve to one of the following values
 *   - `undefined` (default): Do nothing and continue
 *   - `visit.SKIP`: Do not visit the children of this node, continue with next
 *     sibling
 *   - `visit.BREAK`: Terminate traversal completely
 *   - `visit.REMOVE`: Remove the current node, then continue with the next one
 *   - `Node`: Replace the current node, then continue by visiting it
 *   - `number`: While iterating the items of a sequence or map, set the index
 *     of the next step. This is useful especially if the index of the current
 *     node has changed.
 *
 * If `visitor` is a single function, it will be called with all values
 * encountered in the tree, including e.g. `null` values. Alternatively,
 * separate visitor functions may be defined for each `Map`, `Pair`, `Seq`,
 * `Alias` and `Scalar` node. To define the same visitor function for more than
 * one node type, use the `Collection` (map and seq), `Value` (map, seq & scalar)
 * and `Node` (alias, map, seq & scalar) targets. Of all these, only the most
 * specific defined one will be used for each node.
 */
async function visitAsync(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
            node.contents = null;
    }
    else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
}
// Without the `as symbol` casts, TS declares these in the `visit`
// namespace using `var`, but then complains about that because
// `unique symbol` must be `const`.
/** Terminate visit traversal completely */
visitAsync.BREAK = BREAK;
/** Do not visit the children of the current node */
visitAsync.SKIP = SKIP;
/** Remove the current node */
visitAsync.REMOVE = REMOVE;
async function visitAsync_(key, node, visitor, path) {
    const ctrl = await callVisitor(key, node, visitor, path);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== 'symbol') {
        if (identity.isCollection(node)) {
            path = Object.freeze(path.concat(node));
            for (let i = 0; i < node.items.length; ++i) {
                const ci = await visitAsync_(i, node.items[i], visitor, path);
                if (typeof ci === 'number')
                    i = ci - 1;
                else if (ci === BREAK)
                    return BREAK;
                else if (ci === REMOVE) {
                    node.items.splice(i, 1);
                    i -= 1;
                }
            }
        }
        else if (identity.isPair(node)) {
            path = Object.freeze(path.concat(node));
            const ck = await visitAsync_('key', node.key, visitor, path);
            if (ck === BREAK)
                return BREAK;
            else if (ck === REMOVE)
                node.key = null;
            const cv = await visitAsync_('value', node.value, visitor, path);
            if (cv === BREAK)
                return BREAK;
            else if (cv === REMOVE)
                node.value = null;
        }
    }
    return ctrl;
}
function initVisitor(visitor) {
    if (typeof visitor === 'object' &&
        (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
            Alias: visitor.Node,
            Map: visitor.Node,
            Scalar: visitor.Node,
            Seq: visitor.Node
        }, visitor.Value && {
            Map: visitor.Value,
            Scalar: visitor.Value,
            Seq: visitor.Value
        }, visitor.Collection && {
            Map: visitor.Collection,
            Seq: visitor.Collection
        }, visitor);
    }
    return visitor;
}
function callVisitor(key, node, visitor, path) {
    if (typeof visitor === 'function')
        return visitor(key, node, path);
    if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
    if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
    if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
    if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
    if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
    return undefined;
}
function replaceNode(key, path, node) {
    const parent = path[path.length - 1];
    if (identity.isCollection(parent)) {
        parent.items[key] = node;
    }
    else if (identity.isPair(parent)) {
        if (key === 'key')
            parent.key = node;
        else
            parent.value = node;
    }
    else if (identity.isDocument(parent)) {
        parent.contents = node;
    }
    else {
        const pt = identity.isAlias(parent) ? 'alias' : 'scalar';
        throw new Error(`Cannot replace node with ${pt} parent`);
    }
}

exports.visit = visit;
exports.visitAsync = visitAsync;


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = require("node:fs");
;// CONCATENATED MODULE: external "node:os"
const external_node_os_namespaceObject = require("node:os");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = require("node:path");
;// CONCATENATED MODULE: external "node:child_process"
const external_node_child_process_namespaceObject = require("node:child_process");
;// CONCATENATED MODULE: ./src/command.ts

const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');
const TAIL_BYTES = 64 * 1024;
function runProcess(file, args, options = {}) {
    return new Promise((resolve) => {
        let tail = Buffer.alloc(0);
        const child = (0,external_node_child_process_namespaceObject.spawn)(file, args, {
            cwd: options.cwd,
            env: options.env ?? process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const collect = (chunk) => {
            options.echo?.(chunk);
            tail = Buffer.concat([tail, chunk]);
            if (tail.length > TAIL_BYTES)
                tail = tail.subarray(tail.length - TAIL_BYTES);
        };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.on('error', (error) => {
            collect(Buffer.from(`${error.message}\n`));
        });
        child.on('close', (code, signal) => {
            resolve({
                exitCode: code ?? (signal ? 128 : 1),
                tail: tail.toString('utf8'),
            });
        });
    });
}
function runCommand(command, options = {}) {
    return runProcess('bash', ['-c', command], options);
}
function lastLines(text, maxLines = 60, maxChars = 6_000) {
    const lines = text.replace(ANSI_ESCAPE, '').trimEnd().split('\n');
    let result = lines.slice(-maxLines).join('\n');
    if (result.length > maxChars)
        result = result.slice(result.length - maxChars);
    return result;
}

// EXTERNAL MODULE: ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js
var dist = __nccwpck_require__(7620);
;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
var _a;
/** A special constant with type `never` */
const NEVER = /*@__PURE__*/ Object.freeze({
    status: "aborted",
});
function $constructor(name, initializer, params) {
    function init(inst, def) {
        if (!inst._zod) {
            Object.defineProperty(inst, "_zod", {
                value: {
                    def,
                    constr: _,
                    traits: new Set(),
                },
                enumerable: false,
            });
        }
        if (inst._zod.traits.has(name)) {
            return;
        }
        inst._zod.traits.add(name);
        initializer(inst, def);
        // support prototype modifications
        const proto = _.prototype;
        const keys = Object.keys(proto);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (!(k in inst)) {
                inst[k] = proto[k].bind(inst);
            }
        }
    }
    // doesn't work if Parent has a constructor with arguments
    const Parent = params?.Parent ?? Object;
    class Definition extends Parent {
    }
    Object.defineProperty(Definition, "name", { value: name });
    function _(def) {
        var _a;
        const inst = params?.Parent ? new Definition() : this;
        init(inst, def);
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        for (const fn of inst._zod.deferred) {
            fn();
        }
        return inst;
    }
    Object.defineProperty(_, "init", { value: init });
    Object.defineProperty(_, Symbol.hasInstance, {
        value: (inst) => {
            if (params?.Parent && inst instanceof params.Parent)
                return true;
            return inst?._zod?.traits?.has(name);
        },
    });
    Object.defineProperty(_, "name", { value: name });
    return _;
}
//////////////////////////////   UTILITIES   ///////////////////////////////////////
const $brand = Symbol("zod_brand");
class $ZodAsyncError extends Error {
    constructor() {
        super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
    }
}
class $ZodEncodeError extends Error {
    constructor(name) {
        super(`Encountered unidirectional transform during encode: ${name}`);
        this.name = "ZodEncodeError";
    }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
const globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
    if (newConfig)
        Object.assign(globalConfig, newConfig);
    return globalConfig;
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js

/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link cuid2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const cuid = /^[cC][0-9a-z]{6,}$/;
const cuid2 = /^[0-9a-z]+$/;
const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
const xid = /^[0-9a-vA-V]{20}$/;
const ksuid = /^[A-Za-z0-9]{27}$/;
const nanoid = /^[a-zA-Z0-9_-]{21}$/;
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
const duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** Implements ISO 8601-2 extensions like explicit +- prefixes, mixing weeks with other units, and fractional/negative components. */
const extendedDuration = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
 *
 * @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
const uuid = (version) => {
    if (!version)
        return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
    return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
const uuid4 = /*@__PURE__*/ (/* unused pure expression or super */ null && (uuid(4)));
const uuid6 = /*@__PURE__*/ (/* unused pure expression or super */ null && (uuid(6)));
const uuid7 = /*@__PURE__*/ (/* unused pure expression or super */ null && (uuid(7)));
/** Practical email validation */
const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
/** Equivalent to the HTML5 input[type=email] validation implemented by browsers. Source: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/email */
const html5Email = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
/** The classic emailregex.com regex for RFC 5322-compliant emails */
const rfc5322Email = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
/** A loose regex that allows Unicode characters, enforces length limits, and that's about it. */
const unicodeEmail = /^[^\s@"]{1,64}@[^\s@]{1,255}$/u;
const idnEmail = (/* unused pure expression or super */ null && (unicodeEmail));
const browserEmail = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
// from https://thekevinscott.com/emojis-in-javascript/#writing-a-regular-expression
const _emoji = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
    return new RegExp(_emoji, "u");
}
const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
const mac = (delimiter) => {
    const escapedDelim = util.escapeRegex(delimiter ?? ":");
    return new RegExp(`^(?:[0-9A-F]{2}${escapedDelim}){5}[0-9A-F]{2}$|^(?:[0-9a-f]{2}${escapedDelim}){5}[0-9a-f]{2}$`);
};
const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
// https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
const base64url = /^[A-Za-z0-9_-]*$/;
// based on https://stackoverflow.com/questions/106179/regular-expression-to-match-dns-hostname-or-ip-address
// export const hostname: RegExp = /^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/;
const hostname = /^(?=.{1,253}\.?$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[-0-9a-zA-Z]{0,61}[0-9a-zA-Z])?)*\.?$/;
const domain = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const httpProtocol = /^https?$/;
// https://blog.stevenlevithan.com/archives/validate-phone-number#r4-3 (regex sans spaces)
// E.164: leading digit must be 1-9; total digits (excluding '+') between 7-15
const e164 = /^\+[1-9]\d{6,14}$/;
// const dateSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
const date = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
function timeSource(args) {
    const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
    const regex = typeof args.precision === "number"
        ? args.precision === -1
            ? `${hhmm}`
            : args.precision === 0
                ? `${hhmm}:[0-5]\\d`
                : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}`
        : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
    return regex;
}
function time(args) {
    return new RegExp(`^${timeSource(args)}$`);
}
// Adapted from https://stackoverflow.com/a/3143231
function datetime(args) {
    const time = timeSource({ precision: args.precision });
    const opts = ["Z"];
    if (args.local)
        opts.push("");
    // if (args.offset) opts.push(`([+-]\\d{2}:\\d{2})`);
    if (args.offset)
        opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
    const timeRegex = `${time}(?:${opts.join("|")})`;
    return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
const string = (params) => {
    const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
    return new RegExp(`^${regex}$`);
};
const bigint = /^-?\d+n?$/;
const integer = /^-?\d+$/;
const number = /^-?\d+(?:\.\d+)?$/;
const regexes_boolean = /^(?:true|false)$/i;
const _null = /^null$/i;

const _undefined = /^undefined$/i;

// regex for string with no uppercase letters
const lowercase = /^[^A-Z]*$/;
// regex for string with no lowercase letters
const uppercase = /^[^a-z]*$/;
// regex for hexadecimal strings (any length)
const hex = /^[0-9a-fA-F]*$/;
// Hash regexes for different algorithms and encodings
// Helper function to create base64 regex with exact length and padding
function fixedBase64(bodyLength, padding) {
    return new RegExp(`^[A-Za-z0-9+/]{${bodyLength}}${padding}$`);
}
// Helper function to create base64url regex with exact length (no padding)
function fixedBase64url(length) {
    return new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
}
// MD5 (16 bytes): base64 = 24 chars total (22 + "==")
const md5_hex = /^[0-9a-fA-F]{32}$/;
const md5_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(22, "==")));
const md5_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(22)));
// SHA1 (20 bytes): base64 = 28 chars total (27 + "=")
const sha1_hex = /^[0-9a-fA-F]{40}$/;
const sha1_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(27, "=")));
const sha1_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(27)));
// SHA256 (32 bytes): base64 = 44 chars total (43 + "=")
const sha256_hex = /^[0-9a-fA-F]{64}$/;
const sha256_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(43, "=")));
const sha256_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(43)));
// SHA384 (48 bytes): base64 = 64 chars total (no padding)
const sha384_hex = /^[0-9a-fA-F]{96}$/;
const sha384_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(64, "")));
const sha384_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(64)));
// SHA512 (64 bytes): base64 = 88 chars total (86 + "==")
const sha512_hex = /^[0-9a-fA-F]{128}$/;
const sha512_base64 = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64(86, "==")));
const sha512_base64url = /*@__PURE__*/ (/* unused pure expression or super */ null && (fixedBase64url(86)));

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js

// functions
function assertEqual(val) {
    return val;
}
function assertNotEqual(val) {
    return val;
}
function assertIs(_arg) { }
function assertNever(_x) {
    throw new Error("Unexpected value in exhaustive check");
}
function assert(_) { }
function getEnumValues(entries) {
    const numericValues = Object.values(entries).filter((v) => typeof v === "number");
    const values = Object.entries(entries)
        .filter(([k, _]) => numericValues.indexOf(+k) === -1)
        .map(([_, v]) => v);
    return values;
}
function joinValues(array, separator = "|") {
    return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
    if (typeof value === "bigint")
        return value.toString();
    return value;
}
function cached(getter) {
    const set = false;
    return {
        get value() {
            if (!set) {
                const value = getter();
                Object.defineProperty(this, "value", { value });
                return value;
            }
            throw new Error("cached value already set");
        },
    };
}
function nullish(input) {
    return input === null || input === undefined;
}
function cleanRegex(source) {
    const start = source.startsWith("^") ? 1 : 0;
    const end = source.endsWith("$") ? source.length - 1 : source.length;
    return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
    const ratio = val / step;
    const roundedRatio = Math.round(ratio);
    // Use a relative epsilon scaled to the magnitude of the result
    const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
    if (Math.abs(ratio - roundedRatio) < tolerance)
        return 0;
    return ratio - roundedRatio;
}
const EVALUATING = /* @__PURE__*/ Symbol("evaluating");
function defineLazy(object, key, getter) {
    let value = undefined;
    Object.defineProperty(object, key, {
        get() {
            if (value === EVALUATING) {
                // Circular reference detected, return undefined to break the cycle
                return undefined;
            }
            if (value === undefined) {
                value = EVALUATING;
                value = getter();
            }
            return value;
        },
        set(v) {
            Object.defineProperty(object, key, {
                value: v,
                // configurable: true,
            });
            // object[key] = v;
        },
        configurable: true,
    });
}
function objectClone(obj) {
    return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
    Object.defineProperty(target, prop, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}
function mergeDefs(...defs) {
    const mergedDescriptors = {};
    for (const def of defs) {
        const descriptors = Object.getOwnPropertyDescriptors(def);
        Object.assign(mergedDescriptors, descriptors);
    }
    return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
    return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
    if (!path)
        return obj;
    return path.reduce((acc, key) => acc?.[key], obj);
}
function promiseAllObject(promisesObj) {
    const keys = Object.keys(promisesObj);
    const promises = keys.map((key) => promisesObj[key]);
    return Promise.all(promises).then((results) => {
        const resolvedObj = {};
        for (let i = 0; i < keys.length; i++) {
            resolvedObj[keys[i]] = results[i];
        }
        return resolvedObj;
    });
}
function randomString(length = 10) {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let str = "";
    for (let i = 0; i < length; i++) {
        str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
}
function esc(str) {
    return JSON.stringify(str);
}
function slugify(input) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
const captureStackTrace = ("captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => { });
function util_isObject(data) {
    return typeof data === "object" && data !== null && !Array.isArray(data);
}
const util_allowsEval = /* @__PURE__*/ cached(() => {
    // Skip the probe under `jitless`: strict CSPs report the caught `new Function`
    // as a `securitypolicyviolation` even though the throw is swallowed.
    if (globalConfig.jitless) {
        return false;
    }
    // @ts-ignore
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
        return false;
    }
    try {
        const F = Function;
        new F("");
        return true;
    }
    catch (_) {
        return false;
    }
});
function isPlainObject(o) {
    if (util_isObject(o) === false)
        return false;
    // modified constructor
    const ctor = o.constructor;
    if (ctor === undefined)
        return true;
    if (typeof ctor !== "function")
        return true;
    // modified prototype
    const prot = ctor.prototype;
    if (util_isObject(prot) === false)
        return false;
    // ctor doesn't have static `isPrototypeOf`
    if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
        return false;
    }
    return true;
}
function shallowClone(o) {
    if (isPlainObject(o))
        return { ...o };
    if (Array.isArray(o))
        return [...o];
    if (o instanceof Map)
        return new Map(o);
    if (o instanceof Set)
        return new Set(o);
    return o;
}
function numKeys(data) {
    let keyCount = 0;
    for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            keyCount++;
        }
    }
    return keyCount;
}
const getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
        case "undefined":
            return "undefined";
        case "string":
            return "string";
        case "number":
            return Number.isNaN(data) ? "nan" : "number";
        case "boolean":
            return "boolean";
        case "function":
            return "function";
        case "bigint":
            return "bigint";
        case "symbol":
            return "symbol";
        case "object":
            if (Array.isArray(data)) {
                return "array";
            }
            if (data === null) {
                return "null";
            }
            if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
                return "promise";
            }
            if (typeof Map !== "undefined" && data instanceof Map) {
                return "map";
            }
            if (typeof Set !== "undefined" && data instanceof Set) {
                return "set";
            }
            if (typeof Date !== "undefined" && data instanceof Date) {
                return "date";
            }
            // @ts-ignore
            if (typeof File !== "undefined" && data instanceof File) {
                return "file";
            }
            return "object";
        default:
            throw new Error(`Unknown data type: ${t}`);
    }
};
const propertyKeyTypes = /* @__PURE__*/ new Set(["string", "number", "symbol"]);
const primitiveTypes = /* @__PURE__*/ new Set([
    "string",
    "number",
    "bigint",
    "boolean",
    "symbol",
    "undefined",
]);
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// zod-specific utils
function clone(inst, def, params) {
    const cl = new inst._zod.constr(def ?? inst._zod.def);
    if (!def || params?.parent)
        cl._zod.parent = inst;
    return cl;
}
function normalizeParams(_params) {
    const params = _params;
    if (!params)
        return {};
    if (typeof params === "string")
        return { error: () => params };
    if (params?.message !== undefined) {
        if (params?.error !== undefined)
            throw new Error("Cannot specify both `message` and `error` params");
        params.error = params.message;
    }
    delete params.message;
    if (typeof params.error === "string")
        return { ...params, error: () => params.error };
    return params;
}
function createTransparentProxy(getter) {
    let target;
    return new Proxy({}, {
        get(_, prop, receiver) {
            target ?? (target = getter());
            return Reflect.get(target, prop, receiver);
        },
        set(_, prop, value, receiver) {
            target ?? (target = getter());
            return Reflect.set(target, prop, value, receiver);
        },
        has(_, prop) {
            target ?? (target = getter());
            return Reflect.has(target, prop);
        },
        deleteProperty(_, prop) {
            target ?? (target = getter());
            return Reflect.deleteProperty(target, prop);
        },
        ownKeys(_) {
            target ?? (target = getter());
            return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(_, prop) {
            target ?? (target = getter());
            return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        defineProperty(_, prop, descriptor) {
            target ?? (target = getter());
            return Reflect.defineProperty(target, prop, descriptor);
        },
    });
}
function stringifyPrimitive(value) {
    if (typeof value === "bigint")
        return value.toString() + "n";
    if (typeof value === "string")
        return `"${value}"`;
    return `${value}`;
}
function optionalKeys(shape) {
    return Object.keys(shape).filter((k) => {
        return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
    });
}
const NUMBER_FORMAT_RANGES = {
    safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    int32: [-2147483648, 2147483647],
    uint32: [0, 4294967295],
    float32: [-3.4028234663852886e38, 3.4028234663852886e38],
    float64: [-Number.MAX_VALUE, Number.MAX_VALUE],
};
const BIGINT_FORMAT_RANGES = {
    int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
    uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")],
};
function pick(schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
        throw new Error(".pick() cannot be used on object schemas containing refinements");
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const newShape = {};
            for (const key in mask) {
                if (!(key in currDef.shape)) {
                    throw new Error(`Unrecognized key: "${key}"`);
                }
                if (!mask[key])
                    continue;
                newShape[key] = currDef.shape[key];
            }
            assignProp(this, "shape", newShape); // self-caching
            return newShape;
        },
        checks: [],
    });
    return clone(schema, def);
}
function omit(schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
        throw new Error(".omit() cannot be used on object schemas containing refinements");
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const newShape = { ...schema._zod.def.shape };
            for (const key in mask) {
                if (!(key in currDef.shape)) {
                    throw new Error(`Unrecognized key: "${key}"`);
                }
                if (!mask[key])
                    continue;
                delete newShape[key];
            }
            assignProp(this, "shape", newShape); // self-caching
            return newShape;
        },
        checks: [],
    });
    return clone(schema, def);
}
function extend(schema, shape) {
    if (!isPlainObject(shape)) {
        throw new Error("Invalid input to extend: expected a plain object");
    }
    const checks = schema._zod.def.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
        // Only throw if new shape overlaps with existing shape
        // Use getOwnPropertyDescriptor to check key existence without accessing values
        const existingShape = schema._zod.def.shape;
        for (const key in shape) {
            if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
                throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
            }
        }
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const _shape = { ...schema._zod.def.shape, ...shape };
            assignProp(this, "shape", _shape); // self-caching
            return _shape;
        },
    });
    return clone(schema, def);
}
function safeExtend(schema, shape) {
    if (!isPlainObject(shape)) {
        throw new Error("Invalid input to safeExtend: expected a plain object");
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const _shape = { ...schema._zod.def.shape, ...shape };
            assignProp(this, "shape", _shape); // self-caching
            return _shape;
        },
    });
    return clone(schema, def);
}
function merge(a, b) {
    if (a._zod.def.checks?.length) {
        throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
    }
    const def = mergeDefs(a._zod.def, {
        get shape() {
            const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
            assignProp(this, "shape", _shape); // self-caching
            return _shape;
        },
        get catchall() {
            return b._zod.def.catchall;
        },
        checks: b._zod.def.checks ?? [],
    });
    return clone(a, def);
}
function partial(Class, schema, mask) {
    const currDef = schema._zod.def;
    const checks = currDef.checks;
    const hasChecks = checks && checks.length > 0;
    if (hasChecks) {
        throw new Error(".partial() cannot be used on object schemas containing refinements");
    }
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const oldShape = schema._zod.def.shape;
            const shape = { ...oldShape };
            if (mask) {
                for (const key in mask) {
                    if (!(key in oldShape)) {
                        throw new Error(`Unrecognized key: "${key}"`);
                    }
                    if (!mask[key])
                        continue;
                    // if (oldShape[key]!._zod.optin === "optional") continue;
                    shape[key] = Class
                        ? new Class({
                            type: "optional",
                            innerType: oldShape[key],
                        })
                        : oldShape[key];
                }
            }
            else {
                for (const key in oldShape) {
                    // if (oldShape[key]!._zod.optin === "optional") continue;
                    shape[key] = Class
                        ? new Class({
                            type: "optional",
                            innerType: oldShape[key],
                        })
                        : oldShape[key];
                }
            }
            assignProp(this, "shape", shape); // self-caching
            return shape;
        },
        checks: [],
    });
    return clone(schema, def);
}
function required(Class, schema, mask) {
    const def = mergeDefs(schema._zod.def, {
        get shape() {
            const oldShape = schema._zod.def.shape;
            const shape = { ...oldShape };
            if (mask) {
                for (const key in mask) {
                    if (!(key in shape)) {
                        throw new Error(`Unrecognized key: "${key}"`);
                    }
                    if (!mask[key])
                        continue;
                    // overwrite with non-optional
                    shape[key] = new Class({
                        type: "nonoptional",
                        innerType: oldShape[key],
                    });
                }
            }
            else {
                for (const key in oldShape) {
                    // overwrite with non-optional
                    shape[key] = new Class({
                        type: "nonoptional",
                        innerType: oldShape[key],
                    });
                }
            }
            assignProp(this, "shape", shape); // self-caching
            return shape;
        },
    });
    return clone(schema, def);
}
// invalid_type | too_big | too_small | invalid_format | not_multiple_of | unrecognized_keys | invalid_union | invalid_key | invalid_element | invalid_value | custom
function aborted(x, startIndex = 0) {
    if (x.aborted === true)
        return true;
    for (let i = startIndex; i < x.issues.length; i++) {
        if (x.issues[i]?.continue !== true) {
            return true;
        }
    }
    return false;
}
// Checks for explicit abort (continue === false), as opposed to implicit abort (continue === undefined).
// Used to respect `abort: true` in .refine() even for checks that have a `when` function.
function explicitlyAborted(x, startIndex = 0) {
    if (x.aborted === true)
        return true;
    for (let i = startIndex; i < x.issues.length; i++) {
        if (x.issues[i]?.continue === false) {
            return true;
        }
    }
    return false;
}
function prefixIssues(path, issues) {
    return issues.map((iss) => {
        var _a;
        (_a = iss).path ?? (_a.path = []);
        iss.path.unshift(path);
        return iss;
    });
}
function unwrapMessage(message) {
    return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
    const message = iss.message
        ? iss.message
        : (unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ??
            unwrapMessage(ctx?.error?.(iss)) ??
            unwrapMessage(config.customError?.(iss)) ??
            unwrapMessage(config.localeError?.(iss)) ??
            "Invalid input");
    const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
    rest.path ?? (rest.path = []);
    rest.message = message;
    if (ctx?.reportInput) {
        rest.input = _input;
    }
    return rest;
}
function getSizableOrigin(input) {
    if (input instanceof Set)
        return "set";
    if (input instanceof Map)
        return "map";
    // @ts-ignore
    if (input instanceof File)
        return "file";
    return "unknown";
}
function getLengthableOrigin(input) {
    if (Array.isArray(input))
        return "array";
    if (typeof input === "string")
        return "string";
    return "unknown";
}
function parsedType(data) {
    const t = typeof data;
    switch (t) {
        case "number": {
            return Number.isNaN(data) ? "nan" : "number";
        }
        case "object": {
            if (data === null) {
                return "null";
            }
            if (Array.isArray(data)) {
                return "array";
            }
            const obj = data;
            if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
                return obj.constructor.name;
            }
        }
    }
    return t;
}
function util_issue(...args) {
    const [iss, input, inst] = args;
    if (typeof iss === "string") {
        return {
            message: iss,
            code: "custom",
            input,
            inst,
        };
    }
    return { ...iss };
}
function cleanEnum(obj) {
    return Object.entries(obj)
        .filter(([k, _]) => {
        // return true if NaN, meaning it's not a number, thus a string key
        return Number.isNaN(Number.parseInt(k, 10));
    })
        .map((el) => el[1]);
}
// Codec utility functions
function base64ToUint8Array(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
function uint8ArrayToBase64(bytes) {
    let binaryString = "";
    for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryString);
}
function base64urlToUint8Array(base64url) {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    return base64ToUint8Array(base64 + padding);
}
function uint8ArrayToBase64url(bytes) {
    return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex) {
    const cleanHex = hex.replace(/^0x/, "");
    if (cleanHex.length % 2 !== 0) {
        throw new Error("Invalid hex string length");
    }
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
    }
    return bytes;
}
function uint8ArrayToHex(bytes) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
// instanceof
class Class {
    constructor(..._args) { }
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
// import { $ZodType } from "./schemas.js";



const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
    var _a;
    inst._zod ?? (inst._zod = {});
    inst._zod.def = def;
    (_a = inst._zod).onattach ?? (_a.onattach = []);
});
const numericOriginMap = {
    number: "number",
    bigint: "bigint",
    object: "date",
};
const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
        if (def.value < curr) {
            if (def.inclusive)
                bag.maximum = def.value;
            else
                bag.exclusiveMaximum = def.value;
        }
    });
    inst._zod.check = (payload) => {
        if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
            return;
        }
        payload.issues.push({
            origin,
            code: "too_big",
            maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
            input: payload.value,
            inclusive: def.inclusive,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
    $ZodCheck.init(inst, def);
    const origin = numericOriginMap[typeof def.value];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
        if (def.value > curr) {
            if (def.inclusive)
                bag.minimum = def.value;
            else
                bag.exclusiveMinimum = def.value;
        }
    });
    inst._zod.check = (payload) => {
        if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
            return;
        }
        payload.issues.push({
            origin,
            code: "too_small",
            minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
            input: payload.value,
            inclusive: def.inclusive,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckMultipleOf = 
/*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst) => {
        var _a;
        (_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
    });
    inst._zod.check = (payload) => {
        if (typeof payload.value !== typeof def.value)
            throw new Error("Cannot mix number and bigint in multiple_of check.");
        const isMultiple = typeof payload.value === "bigint"
            ? payload.value % def.value === BigInt(0)
            : floatSafeRemainder(payload.value, def.value) === 0;
        if (isMultiple)
            return;
        payload.issues.push({
            origin: typeof payload.value,
            code: "not_multiple_of",
            divisor: def.value,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
    $ZodCheck.init(inst, def); // no format checks
    def.format = def.format || "float64";
    const isInt = def.format?.includes("int");
    const origin = isInt ? "int" : "number";
    const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.format = def.format;
        bag.minimum = minimum;
        bag.maximum = maximum;
        if (isInt)
            bag.pattern = integer;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        if (isInt) {
            if (!Number.isInteger(input)) {
                // invalid_format issue
                // payload.issues.push({
                //   expected: def.format,
                //   format: def.format,
                //   code: "invalid_format",
                //   input,
                //   inst,
                // });
                // invalid_type issue
                payload.issues.push({
                    expected: origin,
                    format: def.format,
                    code: "invalid_type",
                    continue: false,
                    input,
                    inst,
                });
                return;
                // not_multiple_of issue
                // payload.issues.push({
                //   code: "not_multiple_of",
                //   origin: "number",
                //   input,
                //   inst,
                //   divisor: 1,
                // });
            }
            if (!Number.isSafeInteger(input)) {
                if (input > 0) {
                    // too_big
                    payload.issues.push({
                        input,
                        code: "too_big",
                        maximum: Number.MAX_SAFE_INTEGER,
                        note: "Integers must be within the safe integer range.",
                        inst,
                        origin,
                        inclusive: true,
                        continue: !def.abort,
                    });
                }
                else {
                    // too_small
                    payload.issues.push({
                        input,
                        code: "too_small",
                        minimum: Number.MIN_SAFE_INTEGER,
                        note: "Integers must be within the safe integer range.",
                        inst,
                        origin,
                        inclusive: true,
                        continue: !def.abort,
                    });
                }
                return;
            }
        }
        if (input < minimum) {
            payload.issues.push({
                origin: "number",
                input,
                code: "too_small",
                minimum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
        if (input > maximum) {
            payload.issues.push({
                origin: "number",
                input,
                code: "too_big",
                maximum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodCheckBigIntFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckBigIntFormat", (inst, def) => {
    $ZodCheck.init(inst, def); // no format checks
    const [minimum, maximum] = util.BIGINT_FORMAT_RANGES[def.format];
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.format = def.format;
        bag.minimum = minimum;
        bag.maximum = maximum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        if (input < minimum) {
            payload.issues.push({
                origin: "bigint",
                input,
                code: "too_small",
                minimum: minimum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
        if (input > maximum) {
            payload.issues.push({
                origin: "bigint",
                input,
                code: "too_big",
                maximum,
                inclusive: true,
                inst,
                continue: !def.abort,
            });
        }
    };
})));
const $ZodCheckMaxSize = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckMaxSize", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY);
        if (def.maximum < curr)
            inst._zod.bag.maximum = def.maximum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size <= def.maximum)
            return;
        payload.issues.push({
            origin: util.getSizableOrigin(input),
            code: "too_big",
            maximum: def.maximum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodCheckMinSize = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckMinSize", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY);
        if (def.minimum > curr)
            inst._zod.bag.minimum = def.minimum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size >= def.minimum)
            return;
        payload.issues.push({
            origin: util.getSizableOrigin(input),
            code: "too_small",
            minimum: def.minimum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodCheckSizeEquals = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckSizeEquals", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !util.nullish(val) && val.size !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.minimum = def.size;
        bag.maximum = def.size;
        bag.size = def.size;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const size = input.size;
        if (size === def.size)
            return;
        const tooBig = size > def.size;
        payload.issues.push({
            origin: util.getSizableOrigin(input),
            ...(tooBig ? { code: "too_big", maximum: def.size } : { code: "too_small", minimum: def.size }),
            inclusive: true,
            exact: true,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY);
        if (def.maximum < curr)
            inst._zod.bag.maximum = def.maximum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length <= def.maximum)
            return;
        const origin = getLengthableOrigin(input);
        payload.issues.push({
            origin,
            code: "too_big",
            maximum: def.maximum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const curr = (inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY);
        if (def.minimum > curr)
            inst._zod.bag.minimum = def.minimum;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length >= def.minimum)
            return;
        const origin = getLengthableOrigin(input);
        payload.issues.push({
            origin,
            code: "too_small",
            minimum: def.minimum,
            inclusive: true,
            input,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
    var _a;
    $ZodCheck.init(inst, def);
    (_a = inst._zod.def).when ?? (_a.when = (payload) => {
        const val = payload.value;
        return !nullish(val) && val.length !== undefined;
    });
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.minimum = def.length;
        bag.maximum = def.length;
        bag.length = def.length;
    });
    inst._zod.check = (payload) => {
        const input = payload.value;
        const length = input.length;
        if (length === def.length)
            return;
        const origin = getLengthableOrigin(input);
        const tooBig = length > def.length;
        payload.issues.push({
            origin,
            ...(tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length }),
            inclusive: true,
            exact: true,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
    var _a, _b;
    $ZodCheck.init(inst, def);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.format = def.format;
        if (def.pattern) {
            bag.patterns ?? (bag.patterns = new Set());
            bag.patterns.add(def.pattern);
        }
    });
    if (def.pattern)
        (_a = inst._zod).check ?? (_a.check = (payload) => {
            def.pattern.lastIndex = 0;
            if (def.pattern.test(payload.value))
                return;
            payload.issues.push({
                origin: "string",
                code: "invalid_format",
                format: def.format,
                input: payload.value,
                ...(def.pattern ? { pattern: def.pattern.toString() } : {}),
                inst,
                continue: !def.abort,
            });
        });
    else
        (_b = inst._zod).check ?? (_b.check = () => { });
});
const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
    $ZodCheckStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        def.pattern.lastIndex = 0;
        if (def.pattern.test(payload.value))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "regex",
            input: payload.value,
            pattern: def.pattern.toString(),
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
    def.pattern ?? (def.pattern = lowercase);
    $ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
    def.pattern ?? (def.pattern = uppercase);
    $ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
    $ZodCheck.init(inst, def);
    const escapedRegex = escapeRegex(def.includes);
    const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
    def.pattern = pattern;
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.includes(def.includes, def.position))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "includes",
            includes: def.includes,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.startsWith(def.prefix))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "starts_with",
            prefix: def.prefix,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
    $ZodCheck.init(inst, def);
    const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
    def.pattern ?? (def.pattern = pattern);
    inst._zod.onattach.push((inst) => {
        const bag = inst._zod.bag;
        bag.patterns ?? (bag.patterns = new Set());
        bag.patterns.add(pattern);
    });
    inst._zod.check = (payload) => {
        if (payload.value.endsWith(def.suffix))
            return;
        payload.issues.push({
            origin: "string",
            code: "invalid_format",
            format: "ends_with",
            suffix: def.suffix,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
///////////////////////////////////
/////    $ZodCheckProperty    /////
///////////////////////////////////
function handleCheckPropertyResult(result, payload, property) {
    if (result.issues.length) {
        payload.issues.push(...util.prefixIssues(property, result.issues));
    }
}
const $ZodCheckProperty = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckProperty", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
        const result = def.schema._zod.run({
            value: payload.value[def.property],
            issues: [],
        }, {});
        if (result instanceof Promise) {
            return result.then((result) => handleCheckPropertyResult(result, payload, def.property));
        }
        handleCheckPropertyResult(result, payload, def.property);
        return;
    };
})));
const $ZodCheckMimeType = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCheckMimeType", (inst, def) => {
    $ZodCheck.init(inst, def);
    const mimeSet = new Set(def.mime);
    inst._zod.onattach.push((inst) => {
        inst._zod.bag.mime = def.mime;
    });
    inst._zod.check = (payload) => {
        if (mimeSet.has(payload.value.type))
            return;
        payload.issues.push({
            code: "invalid_value",
            values: def.mime,
            input: payload.value.type,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
    $ZodCheck.init(inst, def);
    inst._zod.check = (payload) => {
        payload.value = def.tx(payload.value);
    };
});

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
class Doc {
    constructor(args = []) {
        this.content = [];
        this.indent = 0;
        if (this)
            this.args = args;
    }
    indented(fn) {
        this.indent += 1;
        fn(this);
        this.indent -= 1;
    }
    write(arg) {
        if (typeof arg === "function") {
            arg(this, { execution: "sync" });
            arg(this, { execution: "async" });
            return;
        }
        const content = arg;
        const lines = content.split("\n").filter((x) => x);
        const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
        const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
        for (const line of dedented) {
            this.content.push(line);
        }
    }
    compile() {
        const F = Function;
        const args = this?.args;
        const content = this?.content ?? [``];
        const lines = [...content.map((x) => `  ${x}`)];
        // console.log(lines.join("\n"));
        return new F(...args, lines.join("\n"));
    }
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js


const initializer = (inst, def) => {
    inst.name = "$ZodError";
    Object.defineProperty(inst, "_zod", {
        value: inst._zod,
        enumerable: false,
    });
    Object.defineProperty(inst, "issues", {
        value: def,
        enumerable: false,
    });
    inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
    Object.defineProperty(inst, "toString", {
        value: () => inst.message,
        enumerable: false,
    });
};
const $ZodError = $constructor("$ZodError", initializer);
const $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of error.issues) {
        if (sub.path.length > 0) {
            fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
            fieldErrors[sub.path[0]].push(mapper(sub));
        }
        else {
            formErrors.push(mapper(sub));
        }
    }
    return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue) => issue.message) {
    const fieldErrors = { _errors: [] };
    const processError = (error, path = []) => {
        for (const issue of error.issues) {
            if (issue.code === "invalid_union" && issue.errors.length) {
                issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
            }
            else if (issue.code === "invalid_key") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else if (issue.code === "invalid_element") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else {
                const fullpath = [...path, ...issue.path];
                if (fullpath.length === 0) {
                    fieldErrors._errors.push(mapper(issue));
                }
                else {
                    let curr = fieldErrors;
                    let i = 0;
                    while (i < fullpath.length) {
                        const el = fullpath[i];
                        const terminal = i === fullpath.length - 1;
                        if (!terminal) {
                            curr[el] = curr[el] || { _errors: [] };
                        }
                        else {
                            curr[el] = curr[el] || { _errors: [] };
                            curr[el]._errors.push(mapper(issue));
                        }
                        curr = curr[el];
                        i++;
                    }
                }
            }
        }
    };
    processError(error);
    return fieldErrors;
}
function treeifyError(error, mapper = (issue) => issue.message) {
    const result = { errors: [] };
    const processError = (error, path = []) => {
        var _a, _b;
        for (const issue of error.issues) {
            if (issue.code === "invalid_union" && issue.errors.length) {
                // regular union error
                issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
            }
            else if (issue.code === "invalid_key") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else if (issue.code === "invalid_element") {
                processError({ issues: issue.issues }, [...path, ...issue.path]);
            }
            else {
                const fullpath = [...path, ...issue.path];
                if (fullpath.length === 0) {
                    result.errors.push(mapper(issue));
                    continue;
                }
                let curr = result;
                let i = 0;
                while (i < fullpath.length) {
                    const el = fullpath[i];
                    const terminal = i === fullpath.length - 1;
                    if (typeof el === "string") {
                        curr.properties ?? (curr.properties = {});
                        (_a = curr.properties)[el] ?? (_a[el] = { errors: [] });
                        curr = curr.properties[el];
                    }
                    else {
                        curr.items ?? (curr.items = []);
                        (_b = curr.items)[el] ?? (_b[el] = { errors: [] });
                        curr = curr.items[el];
                    }
                    if (terminal) {
                        curr.errors.push(mapper(issue));
                    }
                    i++;
                }
            }
        }
    };
    processError(error);
    return result;
}
/** Format a ZodError as a human-readable string in the following form.
 *
 * From
 *
 * ```ts
 * ZodError {
 *   issues: [
 *     {
 *       expected: 'string',
 *       code: 'invalid_type',
 *       path: [ 'username' ],
 *       message: 'Invalid input: expected string'
 *     },
 *     {
 *       expected: 'number',
 *       code: 'invalid_type',
 *       path: [ 'favoriteNumbers', 1 ],
 *       message: 'Invalid input: expected number'
 *     }
 *   ];
 * }
 * ```
 *
 * to
 *
 * ```
 * username
 *   ✖ Expected number, received string at "username
 * favoriteNumbers[0]
 *   ✖ Invalid input: expected number
 * ```
 */
function toDotPath(_path) {
    const segs = [];
    const path = _path.map((seg) => (typeof seg === "object" ? seg.key : seg));
    for (const seg of path) {
        if (typeof seg === "number")
            segs.push(`[${seg}]`);
        else if (typeof seg === "symbol")
            segs.push(`[${JSON.stringify(String(seg))}]`);
        else if (/[^\w$]/.test(seg))
            segs.push(`[${JSON.stringify(seg)}]`);
        else {
            if (segs.length)
                segs.push(".");
            segs.push(seg);
        }
    }
    return segs.join("");
}
function prettifyError(error) {
    const lines = [];
    // sort by path length
    const issues = [...error.issues].sort((a, b) => (a.path ?? []).length - (b.path ?? []).length);
    // Process each issue
    for (const issue of issues) {
        lines.push(`✖ ${issue.message}`);
        if (issue.path?.length)
            lines.push(`  → at ${toDotPath(issue.path)}`);
    }
    // Convert Map to formatted string
    return lines.join("\n");
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js



const _parse = (_Err) => (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    if (result.issues.length) {
        const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, _params?.callee);
        throw e;
    }
    return result.value;
};
const parse_parse = /* @__PURE__*/ _parse($ZodRealError);
const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    if (result.issues.length) {
        const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, params?.callee);
        throw e;
    }
    return result.value;
};
const parse_parseAsync = /* @__PURE__*/ _parseAsync($ZodRealError);
const _safeParse = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    return result.issues.length
        ? {
            success: false,
            error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParse = /* @__PURE__*/ _safeParse($ZodRealError);
const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    return result.issues.length
        ? {
            success: false,
            error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParseAsync = /* @__PURE__*/ _safeParseAsync($ZodRealError);
const _encode = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _parse(_Err)(schema, value, ctx);
};
const encode = /* @__PURE__*/ _encode($ZodRealError);
const _decode = (_Err) => (schema, value, _ctx) => {
    return _parse(_Err)(schema, value, _ctx);
};
const decode = /* @__PURE__*/ _decode($ZodRealError);
const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _parseAsync(_Err)(schema, value, ctx);
};
const encodeAsync = /* @__PURE__*/ _encodeAsync($ZodRealError);
const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
    return _parseAsync(_Err)(schema, value, _ctx);
};
const decodeAsync = /* @__PURE__*/ _decodeAsync($ZodRealError);
const _safeEncode = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParse(_Err)(schema, value, ctx);
};
const safeEncode = /* @__PURE__*/ _safeEncode($ZodRealError);
const _safeDecode = (_Err) => (schema, value, _ctx) => {
    return _safeParse(_Err)(schema, value, _ctx);
};
const safeDecode = /* @__PURE__*/ _safeDecode($ZodRealError);
const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return _safeParseAsync(_Err)(schema, value, ctx);
};
const safeEncodeAsync = /* @__PURE__*/ _safeEncodeAsync($ZodRealError);
const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
    return _safeParseAsync(_Err)(schema, value, _ctx);
};
const safeDecodeAsync = /* @__PURE__*/ _safeDecodeAsync($ZodRealError);

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
const version = {
    major: 4,
    minor: 4,
    patch: 3,
};

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js







const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
    var _a;
    inst ?? (inst = {});
    inst._zod.def = def; // set _def property
    inst._zod.bag = inst._zod.bag || {}; // initialize _bag object
    inst._zod.version = version;
    const checks = [...(inst._zod.def.checks ?? [])];
    // if inst is itself a checks.$ZodCheck, run it as a check
    if (inst._zod.traits.has("$ZodCheck")) {
        checks.unshift(inst);
    }
    for (const ch of checks) {
        for (const fn of ch._zod.onattach) {
            fn(inst);
        }
    }
    if (checks.length === 0) {
        // deferred initializer
        // inst._zod.parse is not yet defined
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        inst._zod.deferred?.push(() => {
            inst._zod.run = inst._zod.parse;
        });
    }
    else {
        const runChecks = (payload, checks, ctx) => {
            let isAborted = aborted(payload);
            let asyncResult;
            for (const ch of checks) {
                if (ch._zod.def.when) {
                    if (explicitlyAborted(payload))
                        continue;
                    const shouldRun = ch._zod.def.when(payload);
                    if (!shouldRun)
                        continue;
                }
                else if (isAborted) {
                    continue;
                }
                const currLen = payload.issues.length;
                const _ = ch._zod.check(payload);
                if (_ instanceof Promise && ctx?.async === false) {
                    throw new $ZodAsyncError();
                }
                if (asyncResult || _ instanceof Promise) {
                    asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
                        await _;
                        const nextLen = payload.issues.length;
                        if (nextLen === currLen)
                            return;
                        if (!isAborted)
                            isAborted = aborted(payload, currLen);
                    });
                }
                else {
                    const nextLen = payload.issues.length;
                    if (nextLen === currLen)
                        continue;
                    if (!isAborted)
                        isAborted = aborted(payload, currLen);
                }
            }
            if (asyncResult) {
                return asyncResult.then(() => {
                    return payload;
                });
            }
            return payload;
        };
        const handleCanaryResult = (canary, payload, ctx) => {
            // abort if the canary is aborted
            if (aborted(canary)) {
                canary.aborted = true;
                return canary;
            }
            // run checks first, then
            const checkResult = runChecks(payload, checks, ctx);
            if (checkResult instanceof Promise) {
                if (ctx.async === false)
                    throw new $ZodAsyncError();
                return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
            }
            return inst._zod.parse(checkResult, ctx);
        };
        inst._zod.run = (payload, ctx) => {
            if (ctx.skipChecks) {
                return inst._zod.parse(payload, ctx);
            }
            if (ctx.direction === "backward") {
                // run canary
                // initial pass (no checks)
                const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
                if (canary instanceof Promise) {
                    return canary.then((canary) => {
                        return handleCanaryResult(canary, payload, ctx);
                    });
                }
                return handleCanaryResult(canary, payload, ctx);
            }
            // forward
            const result = inst._zod.parse(payload, ctx);
            if (result instanceof Promise) {
                if (ctx.async === false)
                    throw new $ZodAsyncError();
                return result.then((result) => runChecks(result, checks, ctx));
            }
            return runChecks(result, checks, ctx);
        };
    }
    // Lazy initialize ~standard to avoid creating objects for every schema
    defineLazy(inst, "~standard", () => ({
        validate: (value) => {
            try {
                const r = safeParse(inst, value);
                return r.success ? { value: r.data } : { issues: r.error?.issues };
            }
            catch (_) {
                return safeParseAsync(inst, value).then((r) => (r.success ? { value: r.data } : { issues: r.error?.issues }));
            }
        },
        vendor: "zod",
        version: 1,
    }));
});

const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = [...(inst?._zod.bag?.patterns ?? [])].pop() ?? string(inst._zod.bag);
    inst._zod.parse = (payload, _) => {
        if (def.coerce)
            try {
                payload.value = String(payload.value);
            }
            catch (_) { }
        if (typeof payload.value === "string")
            return payload;
        payload.issues.push({
            expected: "string",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
});
const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
    // check initialization must come first
    $ZodCheckStringFormat.init(inst, def);
    $ZodString.init(inst, def);
});
const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
    def.pattern ?? (def.pattern = guid);
    $ZodStringFormat.init(inst, def);
});
const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
    if (def.version) {
        const versionMap = {
            v1: 1,
            v2: 2,
            v3: 3,
            v4: 4,
            v5: 5,
            v6: 6,
            v7: 7,
            v8: 8,
        };
        const v = versionMap[def.version];
        if (v === undefined)
            throw new Error(`Invalid UUID version: "${def.version}"`);
        def.pattern ?? (def.pattern = uuid(v));
    }
    else
        def.pattern ?? (def.pattern = uuid());
    $ZodStringFormat.init(inst, def);
});
const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
    def.pattern ?? (def.pattern = email);
    $ZodStringFormat.init(inst, def);
});
const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        try {
            // Trim whitespace from input
            const trimmed = payload.value.trim();
            // When normalize is off, require :// for http/https URLs
            // This prevents strings like "http:example.com" or "https:/path" from being silently accepted
            if (!def.normalize && def.protocol?.source === httpProtocol.source) {
                if (!/^https?:\/\//i.test(trimmed)) {
                    payload.issues.push({
                        code: "invalid_format",
                        format: "url",
                        note: "Invalid URL format",
                        input: payload.value,
                        inst,
                        continue: !def.abort,
                    });
                    return;
                }
            }
            // @ts-ignore
            const url = new URL(trimmed);
            if (def.hostname) {
                def.hostname.lastIndex = 0;
                if (!def.hostname.test(url.hostname)) {
                    payload.issues.push({
                        code: "invalid_format",
                        format: "url",
                        note: "Invalid hostname",
                        pattern: def.hostname.source,
                        input: payload.value,
                        inst,
                        continue: !def.abort,
                    });
                }
            }
            if (def.protocol) {
                def.protocol.lastIndex = 0;
                if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
                    payload.issues.push({
                        code: "invalid_format",
                        format: "url",
                        note: "Invalid protocol",
                        pattern: def.protocol.source,
                        input: payload.value,
                        inst,
                        continue: !def.abort,
                    });
                }
            }
            // Set the output value based on normalize flag
            if (def.normalize) {
                // Use normalized URL
                payload.value = url.href;
            }
            else {
                // Preserve the original input (trimmed)
                payload.value = trimmed;
            }
            return;
        }
        catch (_) {
            payload.issues.push({
                code: "invalid_format",
                format: "url",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
    def.pattern ?? (def.pattern = emoji());
    $ZodStringFormat.init(inst, def);
});
const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
    def.pattern ?? (def.pattern = nanoid);
    $ZodStringFormat.init(inst, def);
});
/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
    def.pattern ?? (def.pattern = cuid);
    $ZodStringFormat.init(inst, def);
});
const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
    def.pattern ?? (def.pattern = cuid2);
    $ZodStringFormat.init(inst, def);
});
const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
    def.pattern ?? (def.pattern = ulid);
    $ZodStringFormat.init(inst, def);
});
const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
    def.pattern ?? (def.pattern = xid);
    $ZodStringFormat.init(inst, def);
});
const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
    def.pattern ?? (def.pattern = ksuid);
    $ZodStringFormat.init(inst, def);
});
const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
    def.pattern ?? (def.pattern = datetime(def));
    $ZodStringFormat.init(inst, def);
});
const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
    def.pattern ?? (def.pattern = date);
    $ZodStringFormat.init(inst, def);
});
const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
    def.pattern ?? (def.pattern = time(def));
    $ZodStringFormat.init(inst, def);
});
const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
    def.pattern ?? (def.pattern = duration);
    $ZodStringFormat.init(inst, def);
});
const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
    def.pattern ?? (def.pattern = ipv4);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.format = `ipv4`;
});
const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
    def.pattern ?? (def.pattern = ipv6);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.format = `ipv6`;
    inst._zod.check = (payload) => {
        try {
            // @ts-ignore
            new URL(`http://[${payload.value}]`);
            // return;
        }
        catch {
            payload.issues.push({
                code: "invalid_format",
                format: "ipv6",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
const $ZodMAC = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodMAC", (inst, def) => {
    def.pattern ?? (def.pattern = regexes.mac(def.delimiter));
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.format = `mac`;
})));
const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv4);
    $ZodStringFormat.init(inst, def);
});
const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
    def.pattern ?? (def.pattern = cidrv6); // not used for validation
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        const parts = payload.value.split("/");
        try {
            if (parts.length !== 2)
                throw new Error();
            const [address, prefix] = parts;
            if (!prefix)
                throw new Error();
            const prefixNum = Number(prefix);
            if (`${prefixNum}` !== prefix)
                throw new Error();
            if (prefixNum < 0 || prefixNum > 128)
                throw new Error();
            // @ts-ignore
            new URL(`http://[${address}]`);
        }
        catch {
            payload.issues.push({
                code: "invalid_format",
                format: "cidrv6",
                input: payload.value,
                inst,
                continue: !def.abort,
            });
        }
    };
});
//////////////////////////////   ZodBase64   //////////////////////////////
function isValidBase64(data) {
    if (data === "")
        return true;
    // atob ignores whitespace, so reject it up front.
    if (/\s/.test(data))
        return false;
    if (data.length % 4 !== 0)
        return false;
    try {
        // @ts-ignore
        atob(data);
        return true;
    }
    catch {
        return false;
    }
}
const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
    def.pattern ?? (def.pattern = base64);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.contentEncoding = "base64";
    inst._zod.check = (payload) => {
        if (isValidBase64(payload.value))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "base64",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
//////////////////////////////   ZodBase64   //////////////////////////////
function isValidBase64URL(data) {
    if (!base64url.test(data))
        return false;
    const base64 = data.replace(/[-_]/g, (c) => (c === "-" ? "+" : "/"));
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return isValidBase64(padded);
}
const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
    def.pattern ?? (def.pattern = base64url);
    $ZodStringFormat.init(inst, def);
    inst._zod.bag.contentEncoding = "base64url";
    inst._zod.check = (payload) => {
        if (isValidBase64URL(payload.value))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "base64url",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
    def.pattern ?? (def.pattern = e164);
    $ZodStringFormat.init(inst, def);
});
//////////////////////////////   ZodJWT   //////////////////////////////
function isValidJWT(token, algorithm = null) {
    try {
        const tokensParts = token.split(".");
        if (tokensParts.length !== 3)
            return false;
        const [header] = tokensParts;
        if (!header)
            return false;
        // @ts-ignore
        const parsedHeader = JSON.parse(atob(header));
        if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
            return false;
        if (!parsedHeader.alg)
            return false;
        if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
            return false;
        return true;
    }
    catch {
        return false;
    }
}
const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (isValidJWT(payload.value, def.alg))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: "jwt",
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
});
const $ZodCustomStringFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCustomStringFormat", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    inst._zod.check = (payload) => {
        if (def.fn(payload.value))
            return;
        payload.issues.push({
            code: "invalid_format",
            format: def.format,
            input: payload.value,
            inst,
            continue: !def.abort,
        });
    };
})));
const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = inst._zod.bag.pattern ?? number;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Number(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
            return payload;
        }
        const received = typeof input === "number"
            ? Number.isNaN(input)
                ? "NaN"
                : !Number.isFinite(input)
                    ? "Infinity"
                    : undefined
            : undefined;
        payload.issues.push({
            expected: "number",
            code: "invalid_type",
            input,
            inst,
            ...(received ? { received } : {}),
        });
        return payload;
    };
});
const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
    $ZodCheckNumberFormat.init(inst, def);
    $ZodNumber.init(inst, def); // no format checks
});
const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = regexes_boolean;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Boolean(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "boolean")
            return payload;
        payload.issues.push({
            expected: "boolean",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
});
const $ZodBigInt = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodBigInt", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = regexes.bigint;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = BigInt(payload.value);
            }
            catch (_) { }
        if (typeof payload.value === "bigint")
            return payload;
        payload.issues.push({
            expected: "bigint",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
})));
const $ZodBigIntFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodBigIntFormat", (inst, def) => {
    checks.$ZodCheckBigIntFormat.init(inst, def);
    $ZodBigInt.init(inst, def); // no format checks
})));
const $ZodSymbol = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodSymbol", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "symbol")
            return payload;
        payload.issues.push({
            expected: "symbol",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodUndefined = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodUndefined", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = regexes.undefined;
    inst._zod.values = new Set([undefined]);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "undefined")
            return payload;
        payload.issues.push({
            expected: "undefined",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodNull = /*@__PURE__*/ $constructor("$ZodNull", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = _null;
    inst._zod.values = new Set([null]);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (input === null)
            return payload;
        payload.issues.push({
            expected: "null",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
});
const $ZodAny = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodAny", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
})));
const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload) => payload;
});
const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        payload.issues.push({
            expected: "never",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
});
const $ZodVoid = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodVoid", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (typeof input === "undefined")
            return payload;
        payload.issues.push({
            expected: "void",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodDate = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodDate", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce) {
            try {
                payload.value = new Date(payload.value);
            }
            catch (_err) { }
        }
        const input = payload.value;
        const isDate = input instanceof Date;
        const isValidDate = isDate && !Number.isNaN(input.getTime());
        if (isValidDate)
            return payload;
        payload.issues.push({
            expected: "date",
            code: "invalid_type",
            input,
            ...(isDate ? { received: "Invalid Date" } : {}),
            inst,
        });
        return payload;
    };
})));
function handleArrayResult(result, final, index) {
    if (result.issues.length) {
        final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
}
const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
            payload.issues.push({
                expected: "array",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        payload.value = Array(input.length);
        const proms = [];
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const result = def.element._zod.run({
                value: item,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                proms.push(result.then((result) => handleArrayResult(result, payload, i)));
            }
            else {
                handleArrayResult(result, payload, i);
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => payload);
        }
        return payload; //handleArrayResultsAsync(parseResults, final);
    };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
    const isPresent = key in input;
    if (result.issues.length) {
        // For optional-in/out schemas, ignore errors on absent keys.
        if (isOptionalIn && isOptionalOut && !isPresent) {
            return;
        }
        final.issues.push(...prefixIssues(key, result.issues));
    }
    if (!isPresent && !isOptionalIn) {
        if (!result.issues.length) {
            final.issues.push({
                code: "invalid_type",
                expected: "nonoptional",
                input: undefined,
                path: [key],
            });
        }
        return;
    }
    if (result.value === undefined) {
        if (isPresent) {
            final.value[key] = undefined;
        }
    }
    else {
        final.value[key] = result.value;
    }
}
function normalizeDef(def) {
    const keys = Object.keys(def.shape);
    for (const k of keys) {
        if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
            throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
        }
    }
    const okeys = optionalKeys(def.shape);
    return {
        ...def,
        keys,
        keySet: new Set(keys),
        numKeys: keys.length,
        optionalKeys: new Set(okeys),
    };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
    const unrecognized = [];
    const keySet = def.keySet;
    const _catchall = def.catchall._zod;
    const t = _catchall.def.type;
    const isOptionalIn = _catchall.optin === "optional";
    const isOptionalOut = _catchall.optout === "optional";
    for (const key in input) {
        // skip __proto__ so it can't replace the result prototype via the
        // assignment setter on the plain {} we build into
        if (key === "__proto__")
            continue;
        if (keySet.has(key))
            continue;
        if (t === "never") {
            unrecognized.push(key);
            continue;
        }
        const r = _catchall.run({ value: input[key], issues: [] }, ctx);
        if (r instanceof Promise) {
            proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
        }
        else {
            handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
        }
    }
    if (unrecognized.length) {
        payload.issues.push({
            code: "unrecognized_keys",
            keys: unrecognized,
            input,
            inst,
        });
    }
    if (!proms.length)
        return payload;
    return Promise.all(proms).then(() => {
        return payload;
    });
}
const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
    // requires cast because technically $ZodObject doesn't extend
    $ZodType.init(inst, def);
    // const sh = def.shape;
    const desc = Object.getOwnPropertyDescriptor(def, "shape");
    if (!desc?.get) {
        const sh = def.shape;
        Object.defineProperty(def, "shape", {
            get: () => {
                const newSh = { ...sh };
                Object.defineProperty(def, "shape", {
                    value: newSh,
                });
                return newSh;
            },
        });
    }
    const _normalized = cached(() => normalizeDef(def));
    defineLazy(inst._zod, "propValues", () => {
        const shape = def.shape;
        const propValues = {};
        for (const key in shape) {
            const field = shape[key]._zod;
            if (field.values) {
                propValues[key] ?? (propValues[key] = new Set());
                for (const v of field.values)
                    propValues[key].add(v);
            }
        }
        return propValues;
    });
    const isObject = util_isObject;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject(input)) {
            payload.issues.push({
                expected: "object",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        payload.value = {};
        const proms = [];
        const shape = value.shape;
        for (const key of value.keys) {
            const el = shape[key];
            const isOptionalIn = el._zod.optin === "optional";
            const isOptionalOut = el._zod.optout === "optional";
            const r = el._zod.run({ value: input[key], issues: [] }, ctx);
            if (r instanceof Promise) {
                proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
            }
            else {
                handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
            }
        }
        if (!catchall) {
            return proms.length ? Promise.all(proms).then(() => payload) : payload;
        }
        return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
    };
});
const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
    // requires cast because technically $ZodObject doesn't extend
    $ZodObject.init(inst, def);
    const superParse = inst._zod.parse;
    const _normalized = cached(() => normalizeDef(def));
    const generateFastpass = (shape) => {
        const doc = new Doc(["shape", "payload", "ctx"]);
        const normalized = _normalized.value;
        const parseStr = (key) => {
            const k = esc(key);
            return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
        };
        doc.write(`const input = payload.value;`);
        const ids = Object.create(null);
        let counter = 0;
        for (const key of normalized.keys) {
            ids[key] = `key_${counter++}`;
        }
        // A: preserve key order {
        doc.write(`const newResult = {};`);
        for (const key of normalized.keys) {
            const id = ids[key];
            const k = esc(key);
            const schema = shape[key];
            const isOptionalIn = schema?._zod?.optin === "optional";
            const isOptionalOut = schema?._zod?.optout === "optional";
            doc.write(`const ${id} = ${parseStr(key)};`);
            if (isOptionalIn && isOptionalOut) {
                // For optional-in/out schemas, ignore errors on absent keys
                doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
            }
            else if (!isOptionalIn) {
                doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
            }
            else {
                doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
            }
        }
        doc.write(`payload.value = newResult;`);
        doc.write(`return payload;`);
        const fn = doc.compile();
        return (payload, ctx) => fn(shape, payload, ctx);
    };
    let fastpass;
    const isObject = util_isObject;
    const jit = !globalConfig.jitless;
    const allowsEval = util_allowsEval;
    const fastEnabled = jit && allowsEval.value; // && !def.catchall;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject(input)) {
            payload.issues.push({
                expected: "object",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
            // always synchronous
            if (!fastpass)
                fastpass = generateFastpass(def.shape);
            payload = fastpass(payload, ctx);
            if (!catchall)
                return payload;
            return handleCatchall([], input, payload, ctx, value, inst);
        }
        return superParse(payload, ctx);
    };
});
function handleUnionResults(results, final, inst, ctx) {
    for (const result of results) {
        if (result.issues.length === 0) {
            final.value = result.value;
            return final;
        }
    }
    const nonaborted = results.filter((r) => !aborted(r));
    if (nonaborted.length === 1) {
        final.value = nonaborted[0].value;
        return nonaborted[0];
    }
    final.issues.push({
        code: "invalid_union",
        input: final.value,
        inst,
        errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
    });
    return final;
}
const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
    defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
    defineLazy(inst._zod, "values", () => {
        if (def.options.every((o) => o._zod.values)) {
            return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
        }
        return undefined;
    });
    defineLazy(inst._zod, "pattern", () => {
        if (def.options.every((o) => o._zod.pattern)) {
            const patterns = def.options.map((o) => o._zod.pattern);
            return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
        }
        return undefined;
    });
    const first = def.options.length === 1 ? def.options[0]._zod.run : null;
    inst._zod.parse = (payload, ctx) => {
        if (first) {
            return first(payload, ctx);
        }
        let async = false;
        const results = [];
        for (const option of def.options) {
            const result = option._zod.run({
                value: payload.value,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                results.push(result);
                async = true;
            }
            else {
                if (result.issues.length === 0)
                    return result;
                results.push(result);
            }
        }
        if (!async)
            return handleUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results) => {
            return handleUnionResults(results, payload, inst, ctx);
        });
    };
});
function handleExclusiveUnionResults(results, final, inst, ctx) {
    const successes = results.filter((r) => r.issues.length === 0);
    if (successes.length === 1) {
        final.value = successes[0].value;
        return final;
    }
    if (successes.length === 0) {
        // No matches - same as regular union
        final.issues.push({
            code: "invalid_union",
            input: final.value,
            inst,
            errors: results.map((result) => result.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config()))),
        });
    }
    else {
        // Multiple matches - exclusive union failure
        final.issues.push({
            code: "invalid_union",
            input: final.value,
            inst,
            errors: [],
            inclusive: false,
        });
    }
    return final;
}
const $ZodXor = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodXor", (inst, def) => {
    $ZodUnion.init(inst, def);
    def.inclusive = false;
    const first = def.options.length === 1 ? def.options[0]._zod.run : null;
    inst._zod.parse = (payload, ctx) => {
        if (first) {
            return first(payload, ctx);
        }
        let async = false;
        const results = [];
        for (const option of def.options) {
            const result = option._zod.run({
                value: payload.value,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                results.push(result);
                async = true;
            }
            else {
                results.push(result);
            }
        }
        if (!async)
            return handleExclusiveUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results) => {
            return handleExclusiveUnionResults(results, payload, inst, ctx);
        });
    };
})));
const $ZodDiscriminatedUnion = 
/*@__PURE__*/
$constructor("$ZodDiscriminatedUnion", (inst, def) => {
    def.inclusive = false;
    $ZodUnion.init(inst, def);
    const _super = inst._zod.parse;
    defineLazy(inst._zod, "propValues", () => {
        const propValues = {};
        for (const option of def.options) {
            const pv = option._zod.propValues;
            if (!pv || Object.keys(pv).length === 0)
                throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
            for (const [k, v] of Object.entries(pv)) {
                if (!propValues[k])
                    propValues[k] = new Set();
                for (const val of v) {
                    propValues[k].add(val);
                }
            }
        }
        return propValues;
    });
    const disc = cached(() => {
        const opts = def.options;
        const map = new Map();
        for (const o of opts) {
            const values = o._zod.propValues?.[def.discriminator];
            if (!values || values.size === 0)
                throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
            for (const v of values) {
                if (map.has(v)) {
                    throw new Error(`Duplicate discriminator value "${String(v)}"`);
                }
                map.set(v, o);
            }
        }
        return map;
    });
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!util_isObject(input)) {
            payload.issues.push({
                code: "invalid_type",
                expected: "object",
                input,
                inst,
            });
            return payload;
        }
        const opt = disc.value.get(input?.[def.discriminator]);
        if (opt) {
            return opt._zod.run(payload, ctx);
        }
        // Fall back to union matching when the fast discriminator path fails:
        // - explicitly enabled via unionFallback, or
        // - during backward direction (encode), since codec-based discriminators
        //   have different values in forward vs backward directions
        if (def.unionFallback || ctx.direction === "backward") {
            return _super(payload, ctx);
        }
        // no matching discriminator
        payload.issues.push({
            code: "invalid_union",
            errors: [],
            note: "No matching discriminator",
            discriminator: def.discriminator,
            options: Array.from(disc.value.keys()),
            input,
            path: [def.discriminator],
            inst,
        });
        return payload;
    };
});
const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        const left = def.left._zod.run({ value: input, issues: [] }, ctx);
        const right = def.right._zod.run({ value: input, issues: [] }, ctx);
        const async = left instanceof Promise || right instanceof Promise;
        if (async) {
            return Promise.all([left, right]).then(([left, right]) => {
                return handleIntersectionResults(payload, left, right);
            });
        }
        return handleIntersectionResults(payload, left, right);
    };
});
function mergeValues(a, b) {
    // const aType = parse.t(a);
    // const bType = parse.t(b);
    if (a === b) {
        return { valid: true, data: a };
    }
    if (a instanceof Date && b instanceof Date && +a === +b) {
        return { valid: true, data: a };
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const bKeys = Object.keys(b);
        const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
        const newObj = { ...a, ...b };
        for (const key of sharedKeys) {
            const sharedValue = mergeValues(a[key], b[key]);
            if (!sharedValue.valid) {
                return {
                    valid: false,
                    mergeErrorPath: [key, ...sharedValue.mergeErrorPath],
                };
            }
            newObj[key] = sharedValue.data;
        }
        return { valid: true, data: newObj };
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return { valid: false, mergeErrorPath: [] };
        }
        const newArray = [];
        for (let index = 0; index < a.length; index++) {
            const itemA = a[index];
            const itemB = b[index];
            const sharedValue = mergeValues(itemA, itemB);
            if (!sharedValue.valid) {
                return {
                    valid: false,
                    mergeErrorPath: [index, ...sharedValue.mergeErrorPath],
                };
            }
            newArray.push(sharedValue.data);
        }
        return { valid: true, data: newArray };
    }
    return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
    // Track which side(s) report each key as unrecognized
    const unrecKeys = new Map();
    let unrecIssue;
    for (const iss of left.issues) {
        if (iss.code === "unrecognized_keys") {
            unrecIssue ?? (unrecIssue = iss);
            for (const k of iss.keys) {
                if (!unrecKeys.has(k))
                    unrecKeys.set(k, {});
                unrecKeys.get(k).l = true;
            }
        }
        else {
            result.issues.push(iss);
        }
    }
    for (const iss of right.issues) {
        if (iss.code === "unrecognized_keys") {
            for (const k of iss.keys) {
                if (!unrecKeys.has(k))
                    unrecKeys.set(k, {});
                unrecKeys.get(k).r = true;
            }
        }
        else {
            result.issues.push(iss);
        }
    }
    // Report only keys unrecognized by BOTH sides
    const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
    if (bothKeys.length && unrecIssue) {
        result.issues.push({ ...unrecIssue, keys: bothKeys });
    }
    if (aborted(result))
        return result;
    const merged = mergeValues(left.value, right.value);
    if (!merged.valid) {
        throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
    }
    result.value = merged.data;
    return result;
}
const $ZodTuple = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodTuple", (inst, def) => {
    $ZodType.init(inst, def);
    const items = def.items;
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
            payload.issues.push({
                input,
                inst,
                expected: "tuple",
                code: "invalid_type",
            });
            return payload;
        }
        payload.value = [];
        const proms = [];
        const optinStart = getTupleOptStart(items, "optin");
        const optoutStart = getTupleOptStart(items, "optout");
        if (!def.rest) {
            if (input.length < optinStart) {
                payload.issues.push({
                    code: "too_small",
                    minimum: optinStart,
                    inclusive: true,
                    input,
                    inst,
                    origin: "array",
                });
                return payload;
            }
            if (input.length > items.length) {
                payload.issues.push({
                    code: "too_big",
                    maximum: items.length,
                    inclusive: true,
                    input,
                    inst,
                    origin: "array",
                });
            }
        }
        // Run every item in parallel, collecting results into an indexed
        // array. The post-processing in `handleTupleResults` walks them in
        // order so it can decide whether an absent optional-output error can
        // truncate the tail or must be reported to preserve required output.
        const itemResults = new Array(items.length);
        for (let i = 0; i < items.length; i++) {
            const r = items[i]._zod.run({ value: input[i], issues: [] }, ctx);
            if (r instanceof Promise) {
                proms.push(r.then((rr) => {
                    itemResults[i] = rr;
                }));
            }
            else {
                itemResults[i] = r;
            }
        }
        if (def.rest) {
            let i = items.length - 1;
            const rest = input.slice(items.length);
            for (const el of rest) {
                i++;
                const result = def.rest._zod.run({ value: el, issues: [] }, ctx);
                if (result instanceof Promise) {
                    proms.push(result.then((r) => handleTupleResult(r, payload, i)));
                }
                else {
                    handleTupleResult(result, payload, i);
                }
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
        }
        return handleTupleResults(itemResults, payload, items, input, optoutStart);
    };
})));
function getTupleOptStart(items, key) {
    for (let i = items.length - 1; i >= 0; i--) {
        if (items[i]._zod[key] !== "optional")
            return i + 1;
    }
    return 0;
}
function handleTupleResult(result, final, index) {
    if (result.issues.length) {
        final.issues.push(...util.prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
}
function handleTupleResults(itemResults, final, items, input, optoutStart) {
    // Walk results in order. Mirror $ZodObject's swallow-on-absent-optional
    // rule, but only after `optoutStart`: the first index where the output
    // tuple tail can be absent.
    for (let i = 0; i < items.length; i++) {
        const r = itemResults[i];
        const isPresent = i < input.length;
        if (r.issues.length) {
            if (!isPresent && i >= optoutStart) {
                final.value.length = i;
                break;
            }
            final.issues.push(...util.prefixIssues(i, r.issues));
        }
        final.value[i] = r.value;
    }
    // Drop trailing slots that produced `undefined` for absent input
    // (the array analog of an absent optional key on an object). The
    // `i >= input.length` floor is critical: an explicit `undefined`
    // *inside* the input must be preserved even when the schema is
    // optional-out (e.g. `z.string().or(z.undefined())` accepting an
    // explicit undefined value).
    for (let i = final.value.length - 1; i >= input.length; i--) {
        if (items[i]._zod.optout === "optional" && final.value[i] === undefined) {
            final.value.length = i;
        }
        else {
            break;
        }
    }
    return final;
}
const $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!isPlainObject(input)) {
            payload.issues.push({
                expected: "record",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        const proms = [];
        const values = def.keyType._zod.values;
        if (values) {
            payload.value = {};
            const recordKeys = new Set();
            for (const key of values) {
                if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
                    recordKeys.add(typeof key === "number" ? key.toString() : key);
                    const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
                    if (keyResult instanceof Promise) {
                        throw new Error("Async schemas not supported in object keys currently");
                    }
                    if (keyResult.issues.length) {
                        payload.issues.push({
                            code: "invalid_key",
                            origin: "record",
                            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                            input: key,
                            path: [key],
                            inst,
                        });
                        continue;
                    }
                    const outKey = keyResult.value;
                    const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
                    if (result instanceof Promise) {
                        proms.push(result.then((result) => {
                            if (result.issues.length) {
                                payload.issues.push(...prefixIssues(key, result.issues));
                            }
                            payload.value[outKey] = result.value;
                        }));
                    }
                    else {
                        if (result.issues.length) {
                            payload.issues.push(...prefixIssues(key, result.issues));
                        }
                        payload.value[outKey] = result.value;
                    }
                }
            }
            let unrecognized;
            for (const key in input) {
                if (!recordKeys.has(key)) {
                    unrecognized = unrecognized ?? [];
                    unrecognized.push(key);
                }
            }
            if (unrecognized && unrecognized.length > 0) {
                payload.issues.push({
                    code: "unrecognized_keys",
                    input,
                    inst,
                    keys: unrecognized,
                });
            }
        }
        else {
            payload.value = {};
            // Reflect.ownKeys for Symbol-key support; filter non-enumerable to match z.object()
            for (const key of Reflect.ownKeys(input)) {
                if (key === "__proto__")
                    continue;
                if (!Object.prototype.propertyIsEnumerable.call(input, key))
                    continue;
                let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
                if (keyResult instanceof Promise) {
                    throw new Error("Async schemas not supported in object keys currently");
                }
                // Numeric string fallback: if key is a numeric string and failed, retry with Number(key)
                // This handles z.number(), z.literal([1, 2, 3]), and unions containing numeric literals
                const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
                if (checkNumericKey) {
                    const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
                    if (retryResult instanceof Promise) {
                        throw new Error("Async schemas not supported in object keys currently");
                    }
                    if (retryResult.issues.length === 0) {
                        keyResult = retryResult;
                    }
                }
                if (keyResult.issues.length) {
                    if (def.mode === "loose") {
                        // Pass through unchanged
                        payload.value[key] = input[key];
                    }
                    else {
                        // Default "strict" behavior: error on invalid key
                        payload.issues.push({
                            code: "invalid_key",
                            origin: "record",
                            issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                            input: key,
                            path: [key],
                            inst,
                        });
                    }
                    continue;
                }
                const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
                if (result instanceof Promise) {
                    proms.push(result.then((result) => {
                        if (result.issues.length) {
                            payload.issues.push(...prefixIssues(key, result.issues));
                        }
                        payload.value[keyResult.value] = result.value;
                    }));
                }
                else {
                    if (result.issues.length) {
                        payload.issues.push(...prefixIssues(key, result.issues));
                    }
                    payload.value[keyResult.value] = result.value;
                }
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => payload);
        }
        return payload;
    };
});
const $ZodMap = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodMap", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!(input instanceof Map)) {
            payload.issues.push({
                expected: "map",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        const proms = [];
        payload.value = new Map();
        for (const [key, value] of input) {
            const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
            const valueResult = def.valueType._zod.run({ value: value, issues: [] }, ctx);
            if (keyResult instanceof Promise || valueResult instanceof Promise) {
                proms.push(Promise.all([keyResult, valueResult]).then(([keyResult, valueResult]) => {
                    handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
                }));
            }
            else {
                handleMapResult(keyResult, valueResult, payload, key, input, inst, ctx);
            }
        }
        if (proms.length)
            return Promise.all(proms).then(() => payload);
        return payload;
    };
})));
function handleMapResult(keyResult, valueResult, final, key, input, inst, ctx) {
    if (keyResult.issues.length) {
        if (util.propertyKeyTypes.has(typeof key)) {
            final.issues.push(...util.prefixIssues(key, keyResult.issues));
        }
        else {
            final.issues.push({
                code: "invalid_key",
                origin: "map",
                input,
                inst,
                issues: keyResult.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())),
            });
        }
    }
    if (valueResult.issues.length) {
        if (util.propertyKeyTypes.has(typeof key)) {
            final.issues.push(...util.prefixIssues(key, valueResult.issues));
        }
        else {
            final.issues.push({
                origin: "map",
                code: "invalid_element",
                input,
                inst,
                key: key,
                issues: valueResult.issues.map((iss) => util.finalizeIssue(iss, ctx, core.config())),
            });
        }
    }
    final.value.set(keyResult.value, valueResult.value);
}
const $ZodSet = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodSet", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!(input instanceof Set)) {
            payload.issues.push({
                input,
                inst,
                expected: "set",
                code: "invalid_type",
            });
            return payload;
        }
        const proms = [];
        payload.value = new Set();
        for (const item of input) {
            const result = def.valueType._zod.run({ value: item, issues: [] }, ctx);
            if (result instanceof Promise) {
                proms.push(result.then((result) => handleSetResult(result, payload)));
            }
            else
                handleSetResult(result, payload);
        }
        if (proms.length)
            return Promise.all(proms).then(() => payload);
        return payload;
    };
})));
function handleSetResult(result, final) {
    if (result.issues.length) {
        final.issues.push(...result.issues);
    }
    final.value.add(result.value);
}
const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
    $ZodType.init(inst, def);
    const values = getEnumValues(def.entries);
    const valuesSet = new Set(values);
    inst._zod.values = valuesSet;
    inst._zod.pattern = new RegExp(`^(${values
        .filter((k) => propertyKeyTypes.has(typeof k))
        .map((o) => (typeof o === "string" ? escapeRegex(o) : o.toString()))
        .join("|")})$`);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (valuesSet.has(input)) {
            return payload;
        }
        payload.issues.push({
            code: "invalid_value",
            values,
            input,
            inst,
        });
        return payload;
    };
});
const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    if (def.values.length === 0) {
        throw new Error("Cannot create literal schema with no valid values");
    }
    const values = new Set(def.values);
    inst._zod.values = values;
    inst._zod.pattern = new RegExp(`^(${def.values
        .map((o) => (typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)))
        .join("|")})$`);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (values.has(input)) {
            return payload;
        }
        payload.issues.push({
            code: "invalid_value",
            values: def.values,
            input,
            inst,
        });
        return payload;
    };
});
const $ZodFile = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodFile", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        // @ts-ignore
        if (input instanceof File)
            return payload;
        payload.issues.push({
            expected: "file",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
})));
const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            throw new $ZodEncodeError(inst.constructor.name);
        }
        const _out = def.transform(payload.value, payload);
        if (ctx.async) {
            const output = _out instanceof Promise ? _out : Promise.resolve(_out);
            return output.then((output) => {
                payload.value = output;
                payload.fallback = true;
                return payload;
            });
        }
        if (_out instanceof Promise) {
            throw new $ZodAsyncError();
        }
        payload.value = _out;
        payload.fallback = true;
        return payload;
    };
});
function handleOptionalResult(result, input) {
    if (input === undefined && (result.issues.length || result.fallback)) {
        return { issues: [], value: undefined };
    }
    return result;
}
const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.optout = "optional";
    defineLazy(inst._zod, "values", () => {
        return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
    });
    defineLazy(inst._zod, "pattern", () => {
        const pattern = def.innerType._zod.pattern;
        return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        if (def.innerType._zod.optin === "optional") {
            const input = payload.value;
            const result = def.innerType._zod.run(payload, ctx);
            if (result instanceof Promise)
                return result.then((r) => handleOptionalResult(r, input));
            return handleOptionalResult(result, input);
        }
        if (payload.value === undefined) {
            return payload;
        }
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
    // Call parent init - inherits optin/optout = "optional"
    $ZodOptional.init(inst, def);
    // Override values/pattern to NOT add undefined
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
    // Override parse to just delegate (no undefined handling)
    inst._zod.parse = (payload, ctx) => {
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
    defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
    defineLazy(inst._zod, "pattern", () => {
        const pattern = def.innerType._zod.pattern;
        return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
    });
    defineLazy(inst._zod, "values", () => {
        return def.innerType._zod.values ? new Set([...def.innerType._zod.values, null]) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        // Forward direction (decode): allow null to pass through
        if (payload.value === null)
            return payload;
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
    $ZodType.init(inst, def);
    // inst._zod.qin = "true";
    inst._zod.optin = "optional";
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply defaults for undefined input
        if (payload.value === undefined) {
            payload.value = def.defaultValue;
            /**
             * $ZodDefault returns the default value immediately in forward direction.
             * It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
            return payload;
        }
        // Forward direction: continue with default handling
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => handleDefaultResult(result, def));
        }
        return handleDefaultResult(result, def);
    };
});
function handleDefaultResult(payload, def) {
    if (payload.value === undefined) {
        payload.value = def.defaultValue;
    }
    return payload;
}
const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply prefault for undefined input
        if (payload.value === undefined) {
            payload.value = def.defaultValue;
        }
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "values", () => {
        const v = def.innerType._zod.values;
        return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => handleNonOptionalResult(result, inst));
        }
        return handleNonOptionalResult(result, inst);
    };
});
function handleNonOptionalResult(payload, inst) {
    if (!payload.issues.length && payload.value === undefined) {
        payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: payload.value,
            inst,
        });
    }
    return payload;
}
const $ZodSuccess = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodSuccess", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            throw new core.$ZodEncodeError("ZodSuccess");
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => {
                payload.value = result.issues.length === 0;
                return payload;
            });
        }
        payload.value = result.issues.length === 0;
        return payload;
    };
})));
const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        // Forward direction (decode): apply catch logic
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then((result) => {
                payload.value = result.value;
                if (result.issues.length) {
                    payload.value = def.catchValue({
                        ...payload,
                        error: {
                            issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                        },
                        input: payload.value,
                    });
                    payload.issues = [];
                    payload.fallback = true;
                }
                return payload;
            });
        }
        payload.value = result.value;
        if (result.issues.length) {
            payload.value = def.catchValue({
                ...payload,
                error: {
                    issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())),
                },
                input: payload.value,
            });
            payload.issues = [];
            payload.fallback = true;
        }
        return payload;
    };
});
const $ZodNaN = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodNaN", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "number" || !Number.isNaN(payload.value)) {
            payload.issues.push({
                input: payload.value,
                inst,
                expected: "nan",
                code: "invalid_type",
            });
            return payload;
        }
        return payload;
    };
})));
const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "values", () => def.in._zod.values);
    defineLazy(inst._zod, "optin", () => def.in._zod.optin);
    defineLazy(inst._zod, "optout", () => def.out._zod.optout);
    defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            const right = def.out._zod.run(payload, ctx);
            if (right instanceof Promise) {
                return right.then((right) => handlePipeResult(right, def.in, ctx));
            }
            return handlePipeResult(right, def.in, ctx);
        }
        const left = def.in._zod.run(payload, ctx);
        if (left instanceof Promise) {
            return left.then((left) => handlePipeResult(left, def.out, ctx));
        }
        return handlePipeResult(left, def.out, ctx);
    };
});
function handlePipeResult(left, next, ctx) {
    if (left.issues.length) {
        // prevent further checks
        left.aborted = true;
        return left;
    }
    return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
const $ZodCodec = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodCodec", (inst, def) => {
    $ZodType.init(inst, def);
    util.defineLazy(inst._zod, "values", () => def.in._zod.values);
    util.defineLazy(inst._zod, "optin", () => def.in._zod.optin);
    util.defineLazy(inst._zod, "optout", () => def.out._zod.optout);
    util.defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
    inst._zod.parse = (payload, ctx) => {
        const direction = ctx.direction || "forward";
        if (direction === "forward") {
            const left = def.in._zod.run(payload, ctx);
            if (left instanceof Promise) {
                return left.then((left) => handleCodecAResult(left, def, ctx));
            }
            return handleCodecAResult(left, def, ctx);
        }
        else {
            const right = def.out._zod.run(payload, ctx);
            if (right instanceof Promise) {
                return right.then((right) => handleCodecAResult(right, def, ctx));
            }
            return handleCodecAResult(right, def, ctx);
        }
    };
})));
function handleCodecAResult(result, def, ctx) {
    if (result.issues.length) {
        // prevent further checks
        result.aborted = true;
        return result;
    }
    const direction = ctx.direction || "forward";
    if (direction === "forward") {
        const transformed = def.transform(result.value, result);
        if (transformed instanceof Promise) {
            return transformed.then((value) => handleCodecTxResult(result, value, def.out, ctx));
        }
        return handleCodecTxResult(result, transformed, def.out, ctx);
    }
    else {
        const transformed = def.reverseTransform(result.value, result);
        if (transformed instanceof Promise) {
            return transformed.then((value) => handleCodecTxResult(result, value, def.in, ctx));
        }
        return handleCodecTxResult(result, transformed, def.in, ctx);
    }
}
function handleCodecTxResult(left, value, nextSchema, ctx) {
    // Check if transform added any issues
    if (left.issues.length) {
        left.aborted = true;
        return left;
    }
    return nextSchema._zod.run({ value, issues: left.issues }, ctx);
}
const $ZodPreprocess = /*@__PURE__*/ $constructor("$ZodPreprocess", (inst, def) => {
    $ZodPipe.init(inst, def);
});
const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
    defineLazy(inst._zod, "values", () => def.innerType._zod.values);
    defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
    defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
    inst._zod.parse = (payload, ctx) => {
        if (ctx.direction === "backward") {
            return def.innerType._zod.run(payload, ctx);
        }
        const result = def.innerType._zod.run(payload, ctx);
        if (result instanceof Promise) {
            return result.then(handleReadonlyResult);
        }
        return handleReadonlyResult(result);
    };
});
function handleReadonlyResult(payload) {
    payload.value = Object.freeze(payload.value);
    return payload;
}
const $ZodTemplateLiteral = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodTemplateLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    const regexParts = [];
    for (const part of def.parts) {
        if (typeof part === "object" && part !== null) {
            // is Zod schema
            if (!part._zod.pattern) {
                // if (!source)
                throw new Error(`Invalid template literal part, no pattern found: ${[...part._zod.traits].shift()}`);
            }
            const source = part._zod.pattern instanceof RegExp ? part._zod.pattern.source : part._zod.pattern;
            if (!source)
                throw new Error(`Invalid template literal part: ${part._zod.traits}`);
            const start = source.startsWith("^") ? 1 : 0;
            const end = source.endsWith("$") ? source.length - 1 : source.length;
            regexParts.push(source.slice(start, end));
        }
        else if (part === null || util.primitiveTypes.has(typeof part)) {
            regexParts.push(util.escapeRegex(`${part}`));
        }
        else {
            throw new Error(`Invalid template literal part: ${part}`);
        }
    }
    inst._zod.pattern = new RegExp(`^${regexParts.join("")}$`);
    inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "string") {
            payload.issues.push({
                input: payload.value,
                inst,
                expected: "string",
                code: "invalid_type",
            });
            return payload;
        }
        inst._zod.pattern.lastIndex = 0;
        if (!inst._zod.pattern.test(payload.value)) {
            payload.issues.push({
                input: payload.value,
                inst,
                code: "invalid_format",
                format: def.format ?? "template_literal",
                pattern: inst._zod.pattern.source,
            });
            return payload;
        }
        return payload;
    };
})));
const $ZodFunction = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodFunction", (inst, def) => {
    $ZodType.init(inst, def);
    inst._def = def;
    inst._zod.def = def;
    inst.implement = (func) => {
        if (typeof func !== "function") {
            throw new Error("implement() must be called with a function");
        }
        return function (...args) {
            const parsedArgs = inst._def.input ? parse(inst._def.input, args) : args;
            const result = Reflect.apply(func, this, parsedArgs);
            if (inst._def.output) {
                return parse(inst._def.output, result);
            }
            return result;
        };
    };
    inst.implementAsync = (func) => {
        if (typeof func !== "function") {
            throw new Error("implementAsync() must be called with a function");
        }
        return async function (...args) {
            const parsedArgs = inst._def.input ? await parseAsync(inst._def.input, args) : args;
            const result = await Reflect.apply(func, this, parsedArgs);
            if (inst._def.output) {
                return await parseAsync(inst._def.output, result);
            }
            return result;
        };
    };
    inst._zod.parse = (payload, _ctx) => {
        if (typeof payload.value !== "function") {
            payload.issues.push({
                code: "invalid_type",
                expected: "function",
                input: payload.value,
                inst,
            });
            return payload;
        }
        // Check if output is a promise type to determine if we should use async implementation
        const hasPromiseOutput = inst._def.output && inst._def.output._zod.def.type === "promise";
        if (hasPromiseOutput) {
            payload.value = inst.implementAsync(payload.value);
        }
        else {
            payload.value = inst.implement(payload.value);
        }
        return payload;
    };
    inst.input = (...args) => {
        const F = inst.constructor;
        if (Array.isArray(args[0])) {
            return new F({
                type: "function",
                input: new $ZodTuple({
                    type: "tuple",
                    items: args[0],
                    rest: args[1],
                }),
                output: inst._def.output,
            });
        }
        return new F({
            type: "function",
            input: args[0],
            output: inst._def.output,
        });
    };
    inst.output = (output) => {
        const F = inst.constructor;
        return new F({
            type: "function",
            input: inst._def.input,
            output,
        });
    };
    return inst;
})));
const $ZodPromise = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodPromise", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        return Promise.resolve(payload.value).then((inner) => def.innerType._zod.run({ value: inner, issues: [] }, ctx));
    };
})));
const $ZodLazy = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("$ZodLazy", (inst, def) => {
    $ZodType.init(inst, def);
    // Cache the resolved inner type on the shared `def` so all clones of this
    // lazy (e.g. via `.describe()`/`.meta()`) share the same inner instance,
    // preserving identity for cycle detection on recursive schemas.
    util.defineLazy(inst._zod, "innerType", () => {
        const d = def;
        if (!d._cachedInner)
            d._cachedInner = def.getter();
        return d._cachedInner;
    });
    util.defineLazy(inst._zod, "pattern", () => inst._zod.innerType?._zod?.pattern);
    util.defineLazy(inst._zod, "propValues", () => inst._zod.innerType?._zod?.propValues);
    util.defineLazy(inst._zod, "optin", () => inst._zod.innerType?._zod?.optin ?? undefined);
    util.defineLazy(inst._zod, "optout", () => inst._zod.innerType?._zod?.optout ?? undefined);
    inst._zod.parse = (payload, ctx) => {
        const inner = inst._zod.innerType;
        return inner._zod.run(payload, ctx);
    };
})));
const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
    $ZodCheck.init(inst, def);
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, _) => {
        return payload;
    };
    inst._zod.check = (payload) => {
        const input = payload.value;
        const r = def.fn(input);
        if (r instanceof Promise) {
            return r.then((r) => handleRefineResult(r, payload, input, inst));
        }
        handleRefineResult(r, payload, input, inst);
        return;
    };
});
function handleRefineResult(result, payload, input, inst) {
    if (!result) {
        const _iss = {
            code: "custom",
            input,
            inst, // incorporates params.error into issue reporting
            path: [...(inst._zod.def.path ?? [])], // incorporates params.error into issue reporting
            continue: !inst._zod.def.abort,
            // params: inst._zod.def.params,
        };
        if (inst._zod.def.params)
            _iss.params = inst._zod.def.params;
        payload.issues.push(util_issue(_iss));
    }
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
var registries_a;
const $output = Symbol("ZodOutput");
const $input = Symbol("ZodInput");
class $ZodRegistry {
    constructor() {
        this._map = new WeakMap();
        this._idmap = new Map();
    }
    add(schema, ..._meta) {
        const meta = _meta[0];
        this._map.set(schema, meta);
        if (meta && typeof meta === "object" && "id" in meta) {
            this._idmap.set(meta.id, schema);
        }
        return this;
    }
    clear() {
        this._map = new WeakMap();
        this._idmap = new Map();
        return this;
    }
    remove(schema) {
        const meta = this._map.get(schema);
        if (meta && typeof meta === "object" && "id" in meta) {
            this._idmap.delete(meta.id);
        }
        this._map.delete(schema);
        return this;
    }
    get(schema) {
        // return this._map.get(schema) as any;
        // inherit metadata
        const p = schema._zod.parent;
        if (p) {
            const pm = { ...(this.get(p) ?? {}) };
            delete pm.id; // do not inherit id
            const f = { ...pm, ...this._map.get(schema) };
            return Object.keys(f).length ? f : undefined;
        }
        return this._map.get(schema);
    }
    has(schema) {
        return this._map.has(schema);
    }
}
// registries
function registry() {
    return new $ZodRegistry();
}
(registries_a = globalThis).__zod_globalRegistry ?? (registries_a.__zod_globalRegistry = registry());
const globalRegistry = globalThis.__zod_globalRegistry;

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js




// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
    return new Class({
        type: "string",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedString(Class, params) {
    return new Class({
        type: "string",
        coerce: true,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
    return new Class({
        type: "string",
        format: "email",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
    return new Class({
        type: "string",
        format: "guid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
    return new Class({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
    return new Class({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: false,
        version: "v4",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
    return new Class({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: false,
        version: "v6",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
    return new Class({
        type: "string",
        format: "uuid",
        check: "string_format",
        abort: false,
        version: "v7",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
    return new Class({
        type: "string",
        format: "url",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function api_emoji(Class, params) {
    return new Class({
        type: "string",
        format: "emoji",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
    return new Class({
        type: "string",
        format: "nanoid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link _cuid2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
    return new Class({
        type: "string",
        format: "cuid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
    return new Class({
        type: "string",
        format: "cuid2",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
    return new Class({
        type: "string",
        format: "ulid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
    return new Class({
        type: "string",
        format: "xid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
    return new Class({
        type: "string",
        format: "ksuid",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
    return new Class({
        type: "string",
        format: "ipv4",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
    return new Class({
        type: "string",
        format: "ipv6",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _mac(Class, params) {
    return new Class({
        type: "string",
        format: "mac",
        check: "string_format",
        abort: false,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
    return new Class({
        type: "string",
        format: "cidrv4",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
    return new Class({
        type: "string",
        format: "cidrv6",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
    return new Class({
        type: "string",
        format: "base64",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
    return new Class({
        type: "string",
        format: "base64url",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
    return new Class({
        type: "string",
        format: "e164",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
    return new Class({
        type: "string",
        format: "jwt",
        check: "string_format",
        abort: false,
        ...normalizeParams(params),
    });
}
const TimePrecision = {
    Any: null,
    Minute: -1,
    Second: 0,
    Millisecond: 3,
    Microsecond: 6,
};
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
    return new Class({
        type: "string",
        format: "datetime",
        check: "string_format",
        offset: false,
        local: false,
        precision: null,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
    return new Class({
        type: "string",
        format: "date",
        check: "string_format",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
    return new Class({
        type: "string",
        format: "time",
        check: "string_format",
        precision: null,
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
    return new Class({
        type: "string",
        format: "duration",
        check: "string_format",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
    return new Class({
        type: "number",
        checks: [],
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedNumber(Class, params) {
    return new Class({
        type: "number",
        coerce: true,
        checks: [],
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "safeint",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _float32(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "float32",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _float64(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "float64",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _int32(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "int32",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uint32(Class, params) {
    return new Class({
        type: "number",
        check: "number_format",
        abort: false,
        format: "uint32",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
    return new Class({
        type: "boolean",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedBoolean(Class, params) {
    return new Class({
        type: "boolean",
        coerce: true,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _bigint(Class, params) {
    return new Class({
        type: "bigint",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedBigint(Class, params) {
    return new Class({
        type: "bigint",
        coerce: true,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _int64(Class, params) {
    return new Class({
        type: "bigint",
        check: "bigint_format",
        abort: false,
        format: "int64",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uint64(Class, params) {
    return new Class({
        type: "bigint",
        check: "bigint_format",
        abort: false,
        format: "uint64",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _symbol(Class, params) {
    return new Class({
        type: "symbol",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function api_undefined(Class, params) {
    return new Class({
        type: "undefined",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function api_null(Class, params) {
    return new Class({
        type: "null",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _any(Class) {
    return new Class({
        type: "any",
    });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
    return new Class({
        type: "unknown",
    });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
    return new Class({
        type: "never",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _void(Class, params) {
    return new Class({
        type: "void",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _date(Class, params) {
    return new Class({
        type: "date",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _coercedDate(Class, params) {
    return new Class({
        type: "date",
        coerce: true,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _nan(Class, params) {
    return new Class({
        type: "nan",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
    return new $ZodCheckLessThan({
        check: "less_than",
        ...normalizeParams(params),
        value,
        inclusive: false,
    });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
    return new $ZodCheckLessThan({
        check: "less_than",
        ...normalizeParams(params),
        value,
        inclusive: true,
    });
}

// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
    return new $ZodCheckGreaterThan({
        check: "greater_than",
        ...normalizeParams(params),
        value,
        inclusive: false,
    });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
    return new $ZodCheckGreaterThan({
        check: "greater_than",
        ...normalizeParams(params),
        value,
        inclusive: true,
    });
}

// @__NO_SIDE_EFFECTS__
function _positive(params) {
    return _gt(0, params);
}
// negative
// @__NO_SIDE_EFFECTS__
function _negative(params) {
    return _lt(0, params);
}
// nonpositive
// @__NO_SIDE_EFFECTS__
function _nonpositive(params) {
    return _lte(0, params);
}
// nonnegative
// @__NO_SIDE_EFFECTS__
function _nonnegative(params) {
    return _gte(0, params);
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
    return new $ZodCheckMultipleOf({
        check: "multiple_of",
        ...normalizeParams(params),
        value,
    });
}
// @__NO_SIDE_EFFECTS__
function _maxSize(maximum, params) {
    return new checks.$ZodCheckMaxSize({
        check: "max_size",
        ...util.normalizeParams(params),
        maximum,
    });
}
// @__NO_SIDE_EFFECTS__
function _minSize(minimum, params) {
    return new checks.$ZodCheckMinSize({
        check: "min_size",
        ...util.normalizeParams(params),
        minimum,
    });
}
// @__NO_SIDE_EFFECTS__
function _size(size, params) {
    return new checks.$ZodCheckSizeEquals({
        check: "size_equals",
        ...util.normalizeParams(params),
        size,
    });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
    const ch = new $ZodCheckMaxLength({
        check: "max_length",
        ...normalizeParams(params),
        maximum,
    });
    return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
    return new $ZodCheckMinLength({
        check: "min_length",
        ...normalizeParams(params),
        minimum,
    });
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
    return new $ZodCheckLengthEquals({
        check: "length_equals",
        ...normalizeParams(params),
        length,
    });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
    return new $ZodCheckRegex({
        check: "string_format",
        format: "regex",
        ...normalizeParams(params),
        pattern,
    });
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
    return new $ZodCheckLowerCase({
        check: "string_format",
        format: "lowercase",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
    return new $ZodCheckUpperCase({
        check: "string_format",
        format: "uppercase",
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
    return new $ZodCheckIncludes({
        check: "string_format",
        format: "includes",
        ...normalizeParams(params),
        includes,
    });
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
    return new $ZodCheckStartsWith({
        check: "string_format",
        format: "starts_with",
        ...normalizeParams(params),
        prefix,
    });
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
    return new $ZodCheckEndsWith({
        check: "string_format",
        format: "ends_with",
        ...normalizeParams(params),
        suffix,
    });
}
// @__NO_SIDE_EFFECTS__
function _property(property, schema, params) {
    return new checks.$ZodCheckProperty({
        check: "property",
        property,
        schema,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _mime(types, params) {
    return new checks.$ZodCheckMimeType({
        check: "mime_type",
        mime: types,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
    return new $ZodCheckOverwrite({
        check: "overwrite",
        tx,
    });
}
// normalize
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
    return _overwrite((input) => input.normalize(form));
}
// trim
// @__NO_SIDE_EFFECTS__
function _trim() {
    return _overwrite((input) => input.trim());
}
// toLowerCase
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
    return _overwrite((input) => input.toLowerCase());
}
// toUpperCase
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
    return _overwrite((input) => input.toUpperCase());
}
// slugify
// @__NO_SIDE_EFFECTS__
function _slugify() {
    return _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
    return new Class({
        type: "array",
        element,
        // get element() {
        //   return element;
        // },
        ...normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _union(Class, options, params) {
    return new Class({
        type: "union",
        options,
        ...util.normalizeParams(params),
    });
}
function _xor(Class, options, params) {
    return new Class({
        type: "union",
        options,
        inclusive: false,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _discriminatedUnion(Class, discriminator, options, params) {
    return new Class({
        type: "union",
        options,
        discriminator,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _intersection(Class, left, right) {
    return new Class({
        type: "intersection",
        left,
        right,
    });
}
// export function _tuple(
//   Class: util.SchemaClass<schemas.$ZodTuple>,
//   items: [],
//   params?: string | $ZodTupleParams
// ): schemas.$ZodTuple<[], null>;
// @__NO_SIDE_EFFECTS__
function _tuple(Class, items, _paramsOrRest, _params) {
    const hasRest = _paramsOrRest instanceof schemas.$ZodType;
    const params = hasRest ? _params : _paramsOrRest;
    const rest = hasRest ? _paramsOrRest : null;
    return new Class({
        type: "tuple",
        items,
        rest,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _record(Class, keyType, valueType, params) {
    return new Class({
        type: "record",
        keyType,
        valueType,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _map(Class, keyType, valueType, params) {
    return new Class({
        type: "map",
        keyType,
        valueType,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _set(Class, valueType, params) {
    return new Class({
        type: "set",
        valueType,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _enum(Class, values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
    // if (Array.isArray(values)) {
    //   for (const value of values) {
    //     entries[value] = value;
    //   }
    // } else {
    //   Object.assign(entries, values);
    // }
    // const entries: util.EnumLike = {};
    // for (const val of values) {
    //   entries[val] = val;
    // }
    return new Class({
        type: "enum",
        entries,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
/** @deprecated This API has been merged into `z.enum()`. Use `z.enum()` instead.
 *
 * ```ts
 * enum Colors { red, green, blue }
 * z.enum(Colors);
 * ```
 */
function _nativeEnum(Class, entries, params) {
    return new Class({
        type: "enum",
        entries,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _literal(Class, value, params) {
    return new Class({
        type: "literal",
        values: Array.isArray(value) ? value : [value],
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _file(Class, params) {
    return new Class({
        type: "file",
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _transform(Class, fn) {
    return new Class({
        type: "transform",
        transform: fn,
    });
}
// @__NO_SIDE_EFFECTS__
function _optional(Class, innerType) {
    return new Class({
        type: "optional",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _nullable(Class, innerType) {
    return new Class({
        type: "nullable",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _default(Class, innerType, defaultValue) {
    return new Class({
        type: "default",
        innerType,
        get defaultValue() {
            return typeof defaultValue === "function" ? defaultValue() : util.shallowClone(defaultValue);
        },
    });
}
// @__NO_SIDE_EFFECTS__
function _nonoptional(Class, innerType, params) {
    return new Class({
        type: "nonoptional",
        innerType,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _success(Class, innerType) {
    return new Class({
        type: "success",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _catch(Class, innerType, catchValue) {
    return new Class({
        type: "catch",
        innerType,
        catchValue: (typeof catchValue === "function" ? catchValue : () => catchValue),
    });
}
// @__NO_SIDE_EFFECTS__
function _pipe(Class, in_, out) {
    return new Class({
        type: "pipe",
        in: in_,
        out,
    });
}
// @__NO_SIDE_EFFECTS__
function _readonly(Class, innerType) {
    return new Class({
        type: "readonly",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _templateLiteral(Class, parts, params) {
    return new Class({
        type: "template_literal",
        parts,
        ...util.normalizeParams(params),
    });
}
// @__NO_SIDE_EFFECTS__
function _lazy(Class, getter) {
    return new Class({
        type: "lazy",
        getter,
    });
}
// @__NO_SIDE_EFFECTS__
function _promise(Class, innerType) {
    return new Class({
        type: "promise",
        innerType,
    });
}
// @__NO_SIDE_EFFECTS__
function _custom(Class, fn, _params) {
    const norm = util.normalizeParams(_params);
    norm.abort ?? (norm.abort = true); // default to abort:false
    const schema = new Class({
        type: "custom",
        check: "custom",
        fn: fn,
        ...norm,
    });
    return schema;
}
// same as _custom but defaults to abort:false
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
    const schema = new Class({
        type: "custom",
        check: "custom",
        fn: fn,
        ...normalizeParams(_params),
    });
    return schema;
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
    const ch = _check((payload) => {
        payload.addIssue = (issue) => {
            if (typeof issue === "string") {
                payload.issues.push(util_issue(issue, payload.value, ch._zod.def));
            }
            else {
                // for Zod 3 backwards compatibility
                const _issue = issue;
                if (_issue.fatal)
                    _issue.continue = false;
                _issue.code ?? (_issue.code = "custom");
                _issue.input ?? (_issue.input = payload.value);
                _issue.inst ?? (_issue.inst = ch);
                _issue.continue ?? (_issue.continue = !ch._zod.def.abort); // abort is always undefined, so this is always true...
                payload.issues.push(util_issue(_issue));
            }
        };
        return fn(payload.value, payload);
    }, params);
    return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
    const ch = new $ZodCheck({
        check: "custom",
        ...normalizeParams(params),
    });
    ch._zod.check = fn;
    return ch;
}
// @__NO_SIDE_EFFECTS__
function describe(description) {
    const ch = new $ZodCheck({ check: "describe" });
    ch._zod.onattach = [
        (inst) => {
            const existing = globalRegistry.get(inst) ?? {};
            globalRegistry.add(inst, { ...existing, description });
        },
    ];
    ch._zod.check = () => { }; // no-op check
    return ch;
}
// @__NO_SIDE_EFFECTS__
function meta(metadata) {
    const ch = new $ZodCheck({ check: "meta" });
    ch._zod.onattach = [
        (inst) => {
            const existing = globalRegistry.get(inst) ?? {};
            globalRegistry.add(inst, { ...existing, ...metadata });
        },
    ];
    ch._zod.check = () => { }; // no-op check
    return ch;
}
// @__NO_SIDE_EFFECTS__
function _stringbool(Classes, _params) {
    const params = util.normalizeParams(_params);
    let truthyArray = params.truthy ?? ["true", "1", "yes", "on", "y", "enabled"];
    let falsyArray = params.falsy ?? ["false", "0", "no", "off", "n", "disabled"];
    if (params.case !== "sensitive") {
        truthyArray = truthyArray.map((v) => (typeof v === "string" ? v.toLowerCase() : v));
        falsyArray = falsyArray.map((v) => (typeof v === "string" ? v.toLowerCase() : v));
    }
    const truthySet = new Set(truthyArray);
    const falsySet = new Set(falsyArray);
    const _Codec = Classes.Codec ?? schemas.$ZodCodec;
    const _Boolean = Classes.Boolean ?? schemas.$ZodBoolean;
    const _String = Classes.String ?? schemas.$ZodString;
    const stringSchema = new _String({ type: "string", error: params.error });
    const booleanSchema = new _Boolean({ type: "boolean", error: params.error });
    const codec = new _Codec({
        type: "pipe",
        in: stringSchema,
        out: booleanSchema,
        transform: ((input, payload) => {
            let data = input;
            if (params.case !== "sensitive")
                data = data.toLowerCase();
            if (truthySet.has(data)) {
                return true;
            }
            else if (falsySet.has(data)) {
                return false;
            }
            else {
                payload.issues.push({
                    code: "invalid_value",
                    expected: "stringbool",
                    values: [...truthySet, ...falsySet],
                    input: payload.value,
                    inst: codec,
                    continue: false,
                });
                return {};
            }
        }),
        reverseTransform: ((input, _payload) => {
            if (input === true) {
                return truthyArray[0] || "true";
            }
            else {
                return falsyArray[0] || "false";
            }
        }),
        error: params.error,
    });
    return codec;
}
// @__NO_SIDE_EFFECTS__
function _stringFormat(Class, format, fnOrRegex, _params = {}) {
    const params = util.normalizeParams(_params);
    const def = {
        ...util.normalizeParams(_params),
        check: "string_format",
        type: "string",
        format,
        fn: typeof fnOrRegex === "function" ? fnOrRegex : (val) => fnOrRegex.test(val),
        ...params,
    };
    if (fnOrRegex instanceof RegExp) {
        def.pattern = fnOrRegex;
    }
    const inst = new Class(def);
    return inst;
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js

// function initializeContext<T extends schemas.$ZodType>(inputs: JSONSchemaGeneratorParams<T>): ToJSONSchemaContext<T> {
//   return {
//     processor: inputs.processor,
//     metadataRegistry: inputs.metadata ?? globalRegistry,
//     target: inputs.target ?? "draft-2020-12",
//     unrepresentable: inputs.unrepresentable ?? "throw",
//   };
// }
function to_json_schema_initializeContext(params) {
    // Normalize target: convert old non-hyphenated versions to hyphenated versions
    let target = params?.target ?? "draft-2020-12";
    if (target === "draft-4")
        target = "draft-04";
    if (target === "draft-7")
        target = "draft-07";
    return {
        processors: params.processors ?? {},
        metadataRegistry: params?.metadata ?? globalRegistry,
        target,
        unrepresentable: params?.unrepresentable ?? "throw",
        override: params?.override ?? (() => { }),
        io: params?.io ?? "output",
        counter: 0,
        seen: new Map(),
        cycles: params?.cycles ?? "ref",
        reused: params?.reused ?? "inline",
        external: params?.external ?? undefined,
    };
}
function to_json_schema_process(schema, ctx, _params = { path: [], schemaPath: [] }) {
    var _a;
    const def = schema._zod.def;
    // check for schema in seens
    const seen = ctx.seen.get(schema);
    if (seen) {
        seen.count++;
        // check if cycle
        const isCycle = _params.schemaPath.includes(schema);
        if (isCycle) {
            seen.cycle = _params.path;
        }
        return seen.schema;
    }
    // initialize
    const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
    ctx.seen.set(schema, result);
    // custom method overrides default behavior
    const overrideSchema = schema._zod.toJSONSchema?.();
    if (overrideSchema) {
        result.schema = overrideSchema;
    }
    else {
        const params = {
            ..._params,
            schemaPath: [..._params.schemaPath, schema],
            path: _params.path,
        };
        if (schema._zod.processJSONSchema) {
            schema._zod.processJSONSchema(ctx, result.schema, params);
        }
        else {
            const _json = result.schema;
            const processor = ctx.processors[def.type];
            if (!processor) {
                throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
            }
            processor(schema, ctx, _json, params);
        }
        const parent = schema._zod.parent;
        if (parent) {
            // Also set ref if processor didn't (for inheritance)
            if (!result.ref)
                result.ref = parent;
            to_json_schema_process(parent, ctx, params);
            ctx.seen.get(parent).isParent = true;
        }
    }
    // metadata
    const meta = ctx.metadataRegistry.get(schema);
    if (meta)
        Object.assign(result.schema, meta);
    if (ctx.io === "input" && isTransforming(schema)) {
        // examples/defaults only apply to output type of pipe
        delete result.schema.examples;
        delete result.schema.default;
    }
    // set prefault as default
    if (ctx.io === "input" && "_prefault" in result.schema)
        (_a = result.schema).default ?? (_a.default = result.schema._prefault);
    delete result.schema._prefault;
    // pulling fresh from ctx.seen in case it was overwritten
    const _result = ctx.seen.get(schema);
    return _result.schema;
}
function to_json_schema_extractDefs(ctx, schema
// params: EmitParams
) {
    // iterate over seen map;
    const root = ctx.seen.get(schema);
    if (!root)
        throw new Error("Unprocessed schema. This is a bug in Zod.");
    // Track ids to detect duplicates across different schemas
    const idToSchema = new Map();
    for (const entry of ctx.seen.entries()) {
        const id = ctx.metadataRegistry.get(entry[0])?.id;
        if (id) {
            const existing = idToSchema.get(id);
            if (existing && existing !== entry[0]) {
                throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
            }
            idToSchema.set(id, entry[0]);
        }
    }
    // returns a ref to the schema
    // defId will be empty if the ref points to an external schema (or #)
    const makeURI = (entry) => {
        // comparing the seen objects because sometimes
        // multiple schemas map to the same seen object.
        // e.g. lazy
        // external is configured
        const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
        if (ctx.external) {
            const externalId = ctx.external.registry.get(entry[0])?.id; // ?? "__shared";// `__schema${ctx.counter++}`;
            // check if schema is in the external registry
            const uriGenerator = ctx.external.uri ?? ((id) => id);
            if (externalId) {
                return { ref: uriGenerator(externalId) };
            }
            // otherwise, add to __shared
            const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
            entry[1].defId = id; // set defId so it will be reused if needed
            return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
        }
        if (entry[1] === root) {
            return { ref: "#" };
        }
        // self-contained schema
        const uriPrefix = `#`;
        const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
        const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
        return { defId, ref: defUriPrefix + defId };
    };
    // stored cached version in `def` property
    // remove all properties, set $ref
    const extractToDef = (entry) => {
        // if the schema is already a reference, do not extract it
        if (entry[1].schema.$ref) {
            return;
        }
        const seen = entry[1];
        const { ref, defId } = makeURI(entry);
        seen.def = { ...seen.schema };
        // defId won't be set if the schema is a reference to an external schema
        // or if the schema is the root schema
        if (defId)
            seen.defId = defId;
        // wipe away all properties except $ref
        const schema = seen.schema;
        for (const key in schema) {
            delete schema[key];
        }
        schema.$ref = ref;
    };
    // throw on cycles
    // break cycles
    if (ctx.cycles === "throw") {
        for (const entry of ctx.seen.entries()) {
            const seen = entry[1];
            if (seen.cycle) {
                throw new Error("Cycle detected: " +
                    `#/${seen.cycle?.join("/")}/<root>` +
                    '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
            }
        }
    }
    // extract schemas into $defs
    for (const entry of ctx.seen.entries()) {
        const seen = entry[1];
        // convert root schema to # $ref
        if (schema === entry[0]) {
            extractToDef(entry); // this has special handling for the root schema
            continue;
        }
        // extract schemas that are in the external registry
        if (ctx.external) {
            const ext = ctx.external.registry.get(entry[0])?.id;
            if (schema !== entry[0] && ext) {
                extractToDef(entry);
                continue;
            }
        }
        // extract schemas with `id` meta
        const id = ctx.metadataRegistry.get(entry[0])?.id;
        if (id) {
            extractToDef(entry);
            continue;
        }
        // break cycles
        if (seen.cycle) {
            // any
            extractToDef(entry);
            continue;
        }
        // extract reused schemas
        if (seen.count > 1) {
            if (ctx.reused === "ref") {
                extractToDef(entry);
                // biome-ignore lint:
                continue;
            }
        }
    }
}
function to_json_schema_finalize(ctx, schema) {
    const root = ctx.seen.get(schema);
    if (!root)
        throw new Error("Unprocessed schema. This is a bug in Zod.");
    // flatten refs - inherit properties from parent schemas
    const flattenRef = (zodSchema) => {
        const seen = ctx.seen.get(zodSchema);
        // already processed
        if (seen.ref === null)
            return;
        const schema = seen.def ?? seen.schema;
        const _cached = { ...schema };
        const ref = seen.ref;
        seen.ref = null; // prevent infinite recursion
        if (ref) {
            flattenRef(ref);
            const refSeen = ctx.seen.get(ref);
            const refSchema = refSeen.schema;
            // merge referenced schema into current
            if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
                // older drafts can't combine $ref with other properties
                schema.allOf = schema.allOf ?? [];
                schema.allOf.push(refSchema);
            }
            else {
                Object.assign(schema, refSchema);
            }
            // restore child's own properties (child wins)
            Object.assign(schema, _cached);
            const isParentRef = zodSchema._zod.parent === ref;
            // For parent chain, child is a refinement - remove parent-only properties
            if (isParentRef) {
                for (const key in schema) {
                    if (key === "$ref" || key === "allOf")
                        continue;
                    if (!(key in _cached)) {
                        delete schema[key];
                    }
                }
            }
            // When ref was extracted to $defs, remove properties that match the definition
            if (refSchema.$ref && refSeen.def) {
                for (const key in schema) {
                    if (key === "$ref" || key === "allOf")
                        continue;
                    if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) {
                        delete schema[key];
                    }
                }
            }
        }
        // If parent was extracted (has $ref), propagate $ref to this schema
        // This handles cases like: readonly().meta({id}).describe()
        // where processor sets ref to innerType but parent should be referenced
        const parent = zodSchema._zod.parent;
        if (parent && parent !== ref) {
            // Ensure parent is processed first so its def has inherited properties
            flattenRef(parent);
            const parentSeen = ctx.seen.get(parent);
            if (parentSeen?.schema.$ref) {
                schema.$ref = parentSeen.schema.$ref;
                // De-duplicate with parent's definition
                if (parentSeen.def) {
                    for (const key in schema) {
                        if (key === "$ref" || key === "allOf")
                            continue;
                        if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) {
                            delete schema[key];
                        }
                    }
                }
            }
        }
        // execute overrides
        ctx.override({
            zodSchema: zodSchema,
            jsonSchema: schema,
            path: seen.path ?? [],
        });
    };
    for (const entry of [...ctx.seen.entries()].reverse()) {
        flattenRef(entry[0]);
    }
    const result = {};
    if (ctx.target === "draft-2020-12") {
        result.$schema = "https://json-schema.org/draft/2020-12/schema";
    }
    else if (ctx.target === "draft-07") {
        result.$schema = "http://json-schema.org/draft-07/schema#";
    }
    else if (ctx.target === "draft-04") {
        result.$schema = "http://json-schema.org/draft-04/schema#";
    }
    else if (ctx.target === "openapi-3.0") {
        // OpenAPI 3.0 schema objects should not include a $schema property
    }
    else {
        // Arbitrary string values are allowed but won't have a $schema property set
    }
    if (ctx.external?.uri) {
        const id = ctx.external.registry.get(schema)?.id;
        if (!id)
            throw new Error("Schema is missing an `id` property");
        result.$id = ctx.external.uri(id);
    }
    Object.assign(result, root.def ?? root.schema);
    // The `id` in `.meta()` is a Zod-specific registration tag used to extract
    // schemas into $defs — it is not user-facing JSON Schema metadata. Strip it
    // from the output body where it would otherwise leak. The id is preserved
    // implicitly via the $defs key (and via $ref paths).
    const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
    if (rootMetaId !== undefined && result.id === rootMetaId)
        delete result.id;
    // build defs object
    const defs = ctx.external?.defs ?? {};
    for (const entry of ctx.seen.entries()) {
        const seen = entry[1];
        if (seen.def && seen.defId) {
            if (seen.def.id === seen.defId)
                delete seen.def.id;
            defs[seen.defId] = seen.def;
        }
    }
    // set definitions in result
    if (ctx.external) {
    }
    else {
        if (Object.keys(defs).length > 0) {
            if (ctx.target === "draft-2020-12") {
                result.$defs = defs;
            }
            else {
                result.definitions = defs;
            }
        }
    }
    try {
        // this "finalizes" this schema and ensures all cycles are removed
        // each call to finalize() is functionally independent
        // though the seen map is shared
        const finalized = JSON.parse(JSON.stringify(result));
        Object.defineProperty(finalized, "~standard", {
            value: {
                ...schema["~standard"],
                jsonSchema: {
                    input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
                    output: createStandardJSONSchemaMethod(schema, "output", ctx.processors),
                },
            },
            enumerable: false,
            writable: false,
        });
        return finalized;
    }
    catch (_err) {
        throw new Error("Error converting schema to JSON.");
    }
}
function isTransforming(_schema, _ctx) {
    const ctx = _ctx ?? { seen: new Set() };
    if (ctx.seen.has(_schema))
        return false;
    ctx.seen.add(_schema);
    const def = _schema._zod.def;
    if (def.type === "transform")
        return true;
    if (def.type === "array")
        return isTransforming(def.element, ctx);
    if (def.type === "set")
        return isTransforming(def.valueType, ctx);
    if (def.type === "lazy")
        return isTransforming(def.getter(), ctx);
    if (def.type === "promise" ||
        def.type === "optional" ||
        def.type === "nonoptional" ||
        def.type === "nullable" ||
        def.type === "readonly" ||
        def.type === "default" ||
        def.type === "prefault") {
        return isTransforming(def.innerType, ctx);
    }
    if (def.type === "intersection") {
        return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
    }
    if (def.type === "record" || def.type === "map") {
        return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
    }
    if (def.type === "pipe") {
        if (_schema._zod.traits.has("$ZodCodec"))
            return true;
        return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
    }
    if (def.type === "object") {
        for (const key in def.shape) {
            if (isTransforming(def.shape[key], ctx))
                return true;
        }
        return false;
    }
    if (def.type === "union") {
        for (const option of def.options) {
            if (isTransforming(option, ctx))
                return true;
        }
        return false;
    }
    if (def.type === "tuple") {
        for (const item of def.items) {
            if (isTransforming(item, ctx))
                return true;
        }
        if (def.rest && isTransforming(def.rest, ctx))
            return true;
        return false;
    }
    return false;
}
/**
 * Creates a toJSONSchema method for a schema instance.
 * This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
 */
const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
    const ctx = to_json_schema_initializeContext({ ...params, processors });
    to_json_schema_process(schema, ctx);
    to_json_schema_extractDefs(ctx, schema);
    return to_json_schema_finalize(ctx, schema);
};
const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
    const { libraryOptions, target } = params ?? {};
    const ctx = to_json_schema_initializeContext({ ...(libraryOptions ?? {}), target, io, processors });
    to_json_schema_process(schema, ctx);
    to_json_schema_extractDefs(ctx, schema);
    return to_json_schema_finalize(ctx, schema);
};

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js


const formatMap = {
    guid: "uuid",
    url: "uri",
    datetime: "date-time",
    json_string: "json-string",
    regex: "", // do not set
};
// ==================== SIMPLE TYPE PROCESSORS ====================
const stringProcessor = (schema, ctx, _json, _params) => {
    const json = _json;
    json.type = "string";
    const { minimum, maximum, format, patterns, contentEncoding } = schema._zod
        .bag;
    if (typeof minimum === "number")
        json.minLength = minimum;
    if (typeof maximum === "number")
        json.maxLength = maximum;
    // custom pattern overrides format
    if (format) {
        json.format = formatMap[format] ?? format;
        if (json.format === "")
            delete json.format; // empty format is not valid
        // JSON Schema format: "time" requires a full time with offset or Z
        // z.iso.time() does not include timezone information, so format: "time" should never be used
        if (format === "time") {
            delete json.format;
        }
    }
    if (contentEncoding)
        json.contentEncoding = contentEncoding;
    if (patterns && patterns.size > 0) {
        const regexes = [...patterns];
        if (regexes.length === 1)
            json.pattern = regexes[0].source;
        else if (regexes.length > 1) {
            json.allOf = [
                ...regexes.map((regex) => ({
                    ...(ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0"
                        ? { type: "string" }
                        : {}),
                    pattern: regex.source,
                })),
            ];
        }
    }
};
const numberProcessor = (schema, ctx, _json, _params) => {
    const json = _json;
    const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
    if (typeof format === "string" && format.includes("int"))
        json.type = "integer";
    else
        json.type = "number";
    // when both minimum and exclusiveMinimum exist, pick the more restrictive one
    const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
    const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
    const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
    if (exMin) {
        if (legacy) {
            json.minimum = exclusiveMinimum;
            json.exclusiveMinimum = true;
        }
        else {
            json.exclusiveMinimum = exclusiveMinimum;
        }
    }
    else if (typeof minimum === "number") {
        json.minimum = minimum;
    }
    if (exMax) {
        if (legacy) {
            json.maximum = exclusiveMaximum;
            json.exclusiveMaximum = true;
        }
        else {
            json.exclusiveMaximum = exclusiveMaximum;
        }
    }
    else if (typeof maximum === "number") {
        json.maximum = maximum;
    }
    if (typeof multipleOf === "number")
        json.multipleOf = multipleOf;
};
const booleanProcessor = (_schema, _ctx, json, _params) => {
    json.type = "boolean";
};
const bigintProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt cannot be represented in JSON Schema");
    }
};
const symbolProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Symbols cannot be represented in JSON Schema");
    }
};
const nullProcessor = (_schema, ctx, json, _params) => {
    if (ctx.target === "openapi-3.0") {
        json.type = "string";
        json.nullable = true;
        json.enum = [null];
    }
    else {
        json.type = "null";
    }
};
const undefinedProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Undefined cannot be represented in JSON Schema");
    }
};
const voidProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Void cannot be represented in JSON Schema");
    }
};
const neverProcessor = (_schema, _ctx, json, _params) => {
    json.not = {};
};
const anyProcessor = (_schema, _ctx, _json, _params) => {
    // empty schema accepts anything
};
const unknownProcessor = (_schema, _ctx, _json, _params) => {
    // empty schema accepts anything
};
const dateProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Date cannot be represented in JSON Schema");
    }
};
const enumProcessor = (schema, _ctx, json, _params) => {
    const def = schema._zod.def;
    const values = getEnumValues(def.entries);
    // Number enums can have both string and number values
    if (values.every((v) => typeof v === "number"))
        json.type = "number";
    if (values.every((v) => typeof v === "string"))
        json.type = "string";
    json.enum = values;
};
const literalProcessor = (schema, ctx, json, _params) => {
    const def = schema._zod.def;
    const vals = [];
    for (const val of def.values) {
        if (val === undefined) {
            if (ctx.unrepresentable === "throw") {
                throw new Error("Literal `undefined` cannot be represented in JSON Schema");
            }
            else {
                // do not add to vals
            }
        }
        else if (typeof val === "bigint") {
            if (ctx.unrepresentable === "throw") {
                throw new Error("BigInt literals cannot be represented in JSON Schema");
            }
            else {
                vals.push(Number(val));
            }
        }
        else {
            vals.push(val);
        }
    }
    if (vals.length === 0) {
        // do nothing (an undefined literal was stripped)
    }
    else if (vals.length === 1) {
        const val = vals[0];
        json.type = val === null ? "null" : typeof val;
        if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
            json.enum = [val];
        }
        else {
            json.const = val;
        }
    }
    else {
        if (vals.every((v) => typeof v === "number"))
            json.type = "number";
        if (vals.every((v) => typeof v === "string"))
            json.type = "string";
        if (vals.every((v) => typeof v === "boolean"))
            json.type = "boolean";
        if (vals.every((v) => v === null))
            json.type = "null";
        json.enum = vals;
    }
};
const nanProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("NaN cannot be represented in JSON Schema");
    }
};
const templateLiteralProcessor = (schema, _ctx, json, _params) => {
    const _json = json;
    const pattern = schema._zod.pattern;
    if (!pattern)
        throw new Error("Pattern not found in template literal");
    _json.type = "string";
    _json.pattern = pattern.source;
};
const fileProcessor = (schema, _ctx, json, _params) => {
    const _json = json;
    const file = {
        type: "string",
        format: "binary",
        contentEncoding: "binary",
    };
    const { minimum, maximum, mime } = schema._zod.bag;
    if (minimum !== undefined)
        file.minLength = minimum;
    if (maximum !== undefined)
        file.maxLength = maximum;
    if (mime) {
        if (mime.length === 1) {
            file.contentMediaType = mime[0];
            Object.assign(_json, file);
        }
        else {
            Object.assign(_json, file); // shared props at root
            _json.anyOf = mime.map((m) => ({ contentMediaType: m })); // only contentMediaType differs
        }
    }
    else {
        Object.assign(_json, file);
    }
};
const successProcessor = (_schema, _ctx, json, _params) => {
    json.type = "boolean";
};
const customProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Custom types cannot be represented in JSON Schema");
    }
};
const functionProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Function types cannot be represented in JSON Schema");
    }
};
const transformProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Transforms cannot be represented in JSON Schema");
    }
};
const mapProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Map cannot be represented in JSON Schema");
    }
};
const setProcessor = (_schema, ctx, _json, _params) => {
    if (ctx.unrepresentable === "throw") {
        throw new Error("Set cannot be represented in JSON Schema");
    }
};
// ==================== COMPOSITE TYPE PROCESSORS ====================
const arrayProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    const { minimum, maximum } = schema._zod.bag;
    if (typeof minimum === "number")
        json.minItems = minimum;
    if (typeof maximum === "number")
        json.maxItems = maximum;
    json.type = "array";
    json.items = to_json_schema_process(def.element, ctx, {
        ...params,
        path: [...params.path, "items"],
    });
};
const objectProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "object";
    json.properties = {};
    const shape = def.shape;
    for (const key in shape) {
        json.properties[key] = to_json_schema_process(shape[key], ctx, {
            ...params,
            path: [...params.path, "properties", key],
        });
    }
    // required keys
    const allKeys = new Set(Object.keys(shape));
    const requiredKeys = new Set([...allKeys].filter((key) => {
        const v = def.shape[key]._zod;
        if (ctx.io === "input") {
            return v.optin === undefined;
        }
        else {
            return v.optout === undefined;
        }
    }));
    if (requiredKeys.size > 0) {
        json.required = Array.from(requiredKeys);
    }
    // catchall
    if (def.catchall?._zod.def.type === "never") {
        // strict
        json.additionalProperties = false;
    }
    else if (!def.catchall) {
        // regular
        if (ctx.io === "output")
            json.additionalProperties = false;
    }
    else if (def.catchall) {
        json.additionalProperties = to_json_schema_process(def.catchall, ctx, {
            ...params,
            path: [...params.path, "additionalProperties"],
        });
    }
};
const unionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    // Exclusive unions (inclusive === false) use oneOf (exactly one match) instead of anyOf (one or more matches)
    // This includes both z.xor() and discriminated unions
    const isExclusive = def.inclusive === false;
    const options = def.options.map((x, i) => to_json_schema_process(x, ctx, {
        ...params,
        path: [...params.path, isExclusive ? "oneOf" : "anyOf", i],
    }));
    if (isExclusive) {
        json.oneOf = options;
    }
    else {
        json.anyOf = options;
    }
};
const intersectionProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const a = to_json_schema_process(def.left, ctx, {
        ...params,
        path: [...params.path, "allOf", 0],
    });
    const b = to_json_schema_process(def.right, ctx, {
        ...params,
        path: [...params.path, "allOf", 1],
    });
    const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
    const allOf = [
        ...(isSimpleIntersection(a) ? a.allOf : [a]),
        ...(isSimpleIntersection(b) ? b.allOf : [b]),
    ];
    json.allOf = allOf;
};
const tupleProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "array";
    const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
    const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
    const prefixItems = def.items.map((x, i) => to_json_schema_process(x, ctx, {
        ...params,
        path: [...params.path, prefixPath, i],
    }));
    const rest = def.rest
        ? to_json_schema_process(def.rest, ctx, {
            ...params,
            path: [...params.path, restPath, ...(ctx.target === "openapi-3.0" ? [def.items.length] : [])],
        })
        : null;
    if (ctx.target === "draft-2020-12") {
        json.prefixItems = prefixItems;
        if (rest) {
            json.items = rest;
        }
    }
    else if (ctx.target === "openapi-3.0") {
        json.items = {
            anyOf: prefixItems,
        };
        if (rest) {
            json.items.anyOf.push(rest);
        }
        json.minItems = prefixItems.length;
        if (!rest) {
            json.maxItems = prefixItems.length;
        }
    }
    else {
        json.items = prefixItems;
        if (rest) {
            json.additionalItems = rest;
        }
    }
    // length
    const { minimum, maximum } = schema._zod.bag;
    if (typeof minimum === "number")
        json.minItems = minimum;
    if (typeof maximum === "number")
        json.maxItems = maximum;
};
const recordProcessor = (schema, ctx, _json, params) => {
    const json = _json;
    const def = schema._zod.def;
    json.type = "object";
    // For looseRecord with regex patterns, use patternProperties
    // This correctly represents "only validate keys matching the pattern" semantics
    // and composes well with allOf (intersections)
    const keyType = def.keyType;
    const keyBag = keyType._zod.bag;
    const patterns = keyBag?.patterns;
    if (def.mode === "loose" && patterns && patterns.size > 0) {
        // Use patternProperties for looseRecord with regex patterns
        const valueSchema = to_json_schema_process(def.valueType, ctx, {
            ...params,
            path: [...params.path, "patternProperties", "*"],
        });
        json.patternProperties = {};
        for (const pattern of patterns) {
            json.patternProperties[pattern.source] = valueSchema;
        }
    }
    else {
        // Default behavior: use propertyNames + additionalProperties
        if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
            json.propertyNames = to_json_schema_process(def.keyType, ctx, {
                ...params,
                path: [...params.path, "propertyNames"],
            });
        }
        json.additionalProperties = to_json_schema_process(def.valueType, ctx, {
            ...params,
            path: [...params.path, "additionalProperties"],
        });
    }
    // Add required for keys with discrete values (enum, literal, etc.)
    const keyValues = keyType._zod.values;
    if (keyValues) {
        const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
        if (validKeyValues.length > 0) {
            json.required = validKeyValues;
        }
    }
};
const nullableProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    const inner = to_json_schema_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    if (ctx.target === "openapi-3.0") {
        seen.ref = def.innerType;
        json.nullable = true;
    }
    else {
        json.anyOf = [inner, { type: "null" }];
    }
};
const nonoptionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    to_json_schema_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
};
const defaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    to_json_schema_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
const prefaultProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    to_json_schema_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    if (ctx.io === "input")
        json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
const catchProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    to_json_schema_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    let catchValue;
    try {
        catchValue = def.catchValue(undefined);
    }
    catch {
        throw new Error("Dynamic catch values are not supported in JSON Schema");
    }
    json.default = catchValue;
};
const pipeProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    const inIsTransform = def.in._zod.traits.has("$ZodTransform");
    const innerType = ctx.io === "input" ? (inIsTransform ? def.out : def.in) : def.out;
    to_json_schema_process(innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = innerType;
};
const readonlyProcessor = (schema, ctx, json, params) => {
    const def = schema._zod.def;
    to_json_schema_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
    json.readOnly = true;
};
const promiseProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    to_json_schema_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
};
const optionalProcessor = (schema, ctx, _json, params) => {
    const def = schema._zod.def;
    to_json_schema_process(def.innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = def.innerType;
};
const lazyProcessor = (schema, ctx, _json, params) => {
    const innerType = schema._zod.innerType;
    to_json_schema_process(innerType, ctx, params);
    const seen = ctx.seen.get(schema);
    seen.ref = innerType;
};
// ==================== ALL PROCESSORS ====================
const allProcessors = {
    string: stringProcessor,
    number: numberProcessor,
    boolean: booleanProcessor,
    bigint: bigintProcessor,
    symbol: symbolProcessor,
    null: nullProcessor,
    undefined: undefinedProcessor,
    void: voidProcessor,
    never: neverProcessor,
    any: anyProcessor,
    unknown: unknownProcessor,
    date: dateProcessor,
    enum: enumProcessor,
    literal: literalProcessor,
    nan: nanProcessor,
    template_literal: templateLiteralProcessor,
    file: fileProcessor,
    success: successProcessor,
    custom: customProcessor,
    function: functionProcessor,
    transform: transformProcessor,
    map: mapProcessor,
    set: setProcessor,
    array: arrayProcessor,
    object: objectProcessor,
    union: unionProcessor,
    intersection: intersectionProcessor,
    tuple: tupleProcessor,
    record: recordProcessor,
    nullable: nullableProcessor,
    nonoptional: nonoptionalProcessor,
    default: defaultProcessor,
    prefault: prefaultProcessor,
    catch: catchProcessor,
    pipe: pipeProcessor,
    readonly: readonlyProcessor,
    promise: promiseProcessor,
    optional: optionalProcessor,
    lazy: lazyProcessor,
};
function toJSONSchema(input, params) {
    if ("_idmap" in input) {
        // Registry case
        const registry = input;
        const ctx = initializeContext({ ...params, processors: allProcessors });
        const defs = {};
        // First pass: process all schemas to build the seen map
        for (const entry of registry._idmap.entries()) {
            const [_, schema] = entry;
            process(schema, ctx);
        }
        const schemas = {};
        const external = {
            registry,
            uri: params?.uri,
            defs,
        };
        // Update the context with external configuration
        ctx.external = external;
        // Second pass: emit each schema
        for (const entry of registry._idmap.entries()) {
            const [key, schema] = entry;
            extractDefs(ctx, schema);
            schemas[key] = finalize(ctx, schema);
        }
        if (Object.keys(defs).length > 0) {
            const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
            schemas.__shared = {
                [defsSegment]: defs,
            };
        }
        return { schemas };
    }
    // Single schema case
    const ctx = initializeContext({ ...params, processors: allProcessors });
    process(input, ctx);
    extractDefs(ctx, input);
    return finalize(ctx, input);
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js


const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
    $ZodISODateTime.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function iso_datetime(params) {
    return _isoDateTime(ZodISODateTime, params);
}
const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
    $ZodISODate.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function iso_date(params) {
    return _isoDate(ZodISODate, params);
}
const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
    $ZodISOTime.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function iso_time(params) {
    return _isoTime(ZodISOTime, params);
}
const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
    $ZodISODuration.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function iso_duration(params) {
    return _isoDuration(ZodISODuration, params);
}

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js



const errors_initializer = (inst, issues) => {
    $ZodError.init(inst, issues);
    inst.name = "ZodError";
    Object.defineProperties(inst, {
        format: {
            value: (mapper) => formatError(inst, mapper),
            // enumerable: false,
        },
        flatten: {
            value: (mapper) => flattenError(inst, mapper),
            // enumerable: false,
        },
        addIssue: {
            value: (issue) => {
                inst.issues.push(issue);
                inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
            },
            // enumerable: false,
        },
        addIssues: {
            value: (issues) => {
                inst.issues.push(...issues);
                inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
            },
            // enumerable: false,
        },
        isEmpty: {
            get() {
                return inst.issues.length === 0;
            },
            // enumerable: false,
        },
    });
    // Object.defineProperty(inst, "isEmpty", {
    //   get() {
    //     return inst.issues.length === 0;
    //   },
    // });
};
const ZodError = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodError", errors_initializer)));
const ZodRealError = /*@__PURE__*/ $constructor("ZodError", errors_initializer, {
    Parent: Error,
});
// /** @deprecated Use `z.core.$ZodErrorMapCtx` instead. */
// export type ErrorMapCtx = core.$ZodErrorMapCtx;

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js


const classic_parse_parse = /* @__PURE__ */ _parse(ZodRealError);
const classic_parse_parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
const parse_safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
const parse_safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
// Codec functions
const parse_encode = /* @__PURE__ */ _encode(ZodRealError);
const parse_decode = /* @__PURE__ */ _decode(ZodRealError);
const parse_encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
const parse_decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
const parse_safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
const parse_safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
const parse_safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
const parse_safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js







// Lazy-bind builder methods.
//
// Builder methods (`.optional`, `.array`, `.refine`, ...) live as
// non-enumerable getters on each concrete schema constructor's
// prototype. On first access from an instance the getter allocates
// `fn.bind(this)` and caches it as an own property on that instance,
// so detached usage (`const m = schema.optional; m()`) still works
// and the per-instance allocation only happens for methods actually
// touched.
//
// One install per (prototype, group), memoized by `_installedGroups`.
const _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
    const proto = Object.getPrototypeOf(inst);
    let installed = _installedGroups.get(proto);
    if (!installed) {
        installed = new Set();
        _installedGroups.set(proto, installed);
    }
    if (installed.has(group))
        return;
    installed.add(group);
    for (const key in methods) {
        const fn = methods[key];
        Object.defineProperty(proto, key, {
            configurable: true,
            enumerable: false,
            get() {
                const bound = fn.bind(this);
                Object.defineProperty(this, key, {
                    configurable: true,
                    writable: true,
                    enumerable: true,
                    value: bound,
                });
                return bound;
            },
            set(v) {
                Object.defineProperty(this, key, {
                    configurable: true,
                    writable: true,
                    enumerable: true,
                    value: v,
                });
            },
        });
    }
}
const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
    $ZodType.init(inst, def);
    Object.assign(inst["~standard"], {
        jsonSchema: {
            input: createStandardJSONSchemaMethod(inst, "input"),
            output: createStandardJSONSchemaMethod(inst, "output"),
        },
    });
    inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
    inst.def = def;
    inst.type = def.type;
    Object.defineProperty(inst, "_def", { value: def });
    // Parse-family is intentionally kept as per-instance closures: these are
    // the hot path AND the most-detached methods (`arr.map(schema.parse)`,
    // `const { parse } = schema`, etc.). Eager closures here mean callers pay
    // ~12 closure allocations per schema but get monomorphic call sites and
    // detached usage that "just works".
    inst.parse = (data, params) => classic_parse_parse(inst, data, params, { callee: inst.parse });
    inst.safeParse = (data, params) => parse_safeParse(inst, data, params);
    inst.parseAsync = async (data, params) => classic_parse_parseAsync(inst, data, params, { callee: inst.parseAsync });
    inst.safeParseAsync = async (data, params) => parse_safeParseAsync(inst, data, params);
    inst.spa = inst.safeParseAsync;
    inst.encode = (data, params) => parse_encode(inst, data, params);
    inst.decode = (data, params) => parse_decode(inst, data, params);
    inst.encodeAsync = async (data, params) => parse_encodeAsync(inst, data, params);
    inst.decodeAsync = async (data, params) => parse_decodeAsync(inst, data, params);
    inst.safeEncode = (data, params) => parse_safeEncode(inst, data, params);
    inst.safeDecode = (data, params) => parse_safeDecode(inst, data, params);
    inst.safeEncodeAsync = async (data, params) => parse_safeEncodeAsync(inst, data, params);
    inst.safeDecodeAsync = async (data, params) => parse_safeDecodeAsync(inst, data, params);
    // All builder methods are placed on the internal prototype as lazy-bind
    // getters. On first access per-instance, a bound thunk is allocated and
    // cached as an own property; subsequent accesses skip the getter. This
    // means: no per-instance allocation for unused methods, full
    // detachability preserved (`const m = schema.optional; m()` works), and
    // shared underlying function references across all instances.
    _installLazyMethods(inst, "ZodType", {
        check(...chks) {
            const def = this.def;
            return this.clone(mergeDefs(def, {
                checks: [
                    ...(def.checks ?? []),
                    ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch),
                ],
            }), { parent: true });
        },
        with(...chks) {
            return this.check(...chks);
        },
        clone(def, params) {
            return clone(this, def, params);
        },
        brand() {
            return this;
        },
        register(reg, meta) {
            reg.add(this, meta);
            return this;
        },
        refine(check, params) {
            return this.check(refine(check, params));
        },
        superRefine(refinement, params) {
            return this.check(superRefine(refinement, params));
        },
        overwrite(fn) {
            return this.check(_overwrite(fn));
        },
        optional() {
            return optional(this);
        },
        exactOptional() {
            return exactOptional(this);
        },
        nullable() {
            return nullable(this);
        },
        nullish() {
            return optional(nullable(this));
        },
        nonoptional(params) {
            return nonoptional(this, params);
        },
        array() {
            return array(this);
        },
        or(arg) {
            return union([this, arg]);
        },
        and(arg) {
            return intersection(this, arg);
        },
        transform(tx) {
            return pipe(this, transform(tx));
        },
        default(d) {
            return schemas_default(this, d);
        },
        prefault(d) {
            return prefault(this, d);
        },
        catch(params) {
            return schemas_catch(this, params);
        },
        pipe(target) {
            return pipe(this, target);
        },
        readonly() {
            return readonly(this);
        },
        describe(description) {
            const cl = this.clone();
            globalRegistry.add(cl, { description });
            return cl;
        },
        meta(...args) {
            // overloaded: meta() returns the registered metadata, meta(data)
            // returns a clone with `data` registered. The mapped type picks
            // up the second overload, so we accept variadic any-args and
            // return `any` to satisfy both at runtime.
            if (args.length === 0)
                return globalRegistry.get(this);
            const cl = this.clone();
            globalRegistry.add(cl, args[0]);
            return cl;
        },
        isOptional() {
            return this.safeParse(undefined).success;
        },
        isNullable() {
            return this.safeParse(null).success;
        },
        apply(fn) {
            return fn(this);
        },
    });
    Object.defineProperty(inst, "description", {
        get() {
            return globalRegistry.get(inst)?.description;
        },
        configurable: true,
    });
    return inst;
});
/** @internal */
const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
    const bag = inst._zod.bag;
    inst.format = bag.format ?? null;
    inst.minLength = bag.minimum ?? null;
    inst.maxLength = bag.maximum ?? null;
    _installLazyMethods(inst, "_ZodString", {
        regex(...args) {
            return this.check(_regex(...args));
        },
        includes(...args) {
            return this.check(_includes(...args));
        },
        startsWith(...args) {
            return this.check(_startsWith(...args));
        },
        endsWith(...args) {
            return this.check(_endsWith(...args));
        },
        min(...args) {
            return this.check(_minLength(...args));
        },
        max(...args) {
            return this.check(_maxLength(...args));
        },
        length(...args) {
            return this.check(_length(...args));
        },
        nonempty(...args) {
            return this.check(_minLength(1, ...args));
        },
        lowercase(params) {
            return this.check(_lowercase(params));
        },
        uppercase(params) {
            return this.check(_uppercase(params));
        },
        trim() {
            return this.check(_trim());
        },
        normalize(...args) {
            return this.check(_normalize(...args));
        },
        toLowerCase() {
            return this.check(_toLowerCase());
        },
        toUpperCase() {
            return this.check(_toUpperCase());
        },
        slugify() {
            return this.check(_slugify());
        },
    });
});
const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
    $ZodString.init(inst, def);
    _ZodString.init(inst, def);
    inst.email = (params) => inst.check(_email(ZodEmail, params));
    inst.url = (params) => inst.check(_url(ZodURL, params));
    inst.jwt = (params) => inst.check(_jwt(ZodJWT, params));
    inst.emoji = (params) => inst.check(api_emoji(ZodEmoji, params));
    inst.guid = (params) => inst.check(_guid(ZodGUID, params));
    inst.uuid = (params) => inst.check(_uuid(ZodUUID, params));
    inst.uuidv4 = (params) => inst.check(_uuidv4(ZodUUID, params));
    inst.uuidv6 = (params) => inst.check(_uuidv6(ZodUUID, params));
    inst.uuidv7 = (params) => inst.check(_uuidv7(ZodUUID, params));
    inst.nanoid = (params) => inst.check(_nanoid(ZodNanoID, params));
    inst.guid = (params) => inst.check(_guid(ZodGUID, params));
    inst.cuid = (params) => inst.check(_cuid(ZodCUID, params));
    inst.cuid2 = (params) => inst.check(_cuid2(ZodCUID2, params));
    inst.ulid = (params) => inst.check(_ulid(ZodULID, params));
    inst.base64 = (params) => inst.check(_base64(ZodBase64, params));
    inst.base64url = (params) => inst.check(_base64url(ZodBase64URL, params));
    inst.xid = (params) => inst.check(_xid(ZodXID, params));
    inst.ksuid = (params) => inst.check(_ksuid(ZodKSUID, params));
    inst.ipv4 = (params) => inst.check(_ipv4(ZodIPv4, params));
    inst.ipv6 = (params) => inst.check(_ipv6(ZodIPv6, params));
    inst.cidrv4 = (params) => inst.check(_cidrv4(ZodCIDRv4, params));
    inst.cidrv6 = (params) => inst.check(_cidrv6(ZodCIDRv6, params));
    inst.e164 = (params) => inst.check(_e164(ZodE164, params));
    // iso
    inst.datetime = (params) => inst.check(iso_datetime(params));
    inst.date = (params) => inst.check(iso_date(params));
    inst.time = (params) => inst.check(iso_time(params));
    inst.duration = (params) => inst.check(iso_duration(params));
});
function schemas_string(params) {
    return _string(ZodString, params);
}
const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
    $ZodStringFormat.init(inst, def);
    _ZodString.init(inst, def);
});
const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodEmail.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_email(params) {
    return _email(ZodEmail, params);
}
const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodGUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_guid(params) {
    return core._guid(ZodGUID, params);
}
const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodUUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_uuid(params) {
    return _uuid(ZodUUID, params);
}
function uuidv4(params) {
    return core._uuidv4(ZodUUID, params);
}
// ZodUUIDv6
function uuidv6(params) {
    return core._uuidv6(ZodUUID, params);
}
// ZodUUIDv7
function uuidv7(params) {
    return core._uuidv7(ZodUUID, params);
}
const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodURL.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function url(params) {
    return core._url(ZodURL, params);
}
function httpUrl(params) {
    return core._url(ZodURL, {
        protocol: core.regexes.httpProtocol,
        hostname: core.regexes.domain,
        ...util.normalizeParams(params),
    });
}
const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodEmoji.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_emoji(params) {
    return core._emoji(ZodEmoji, params);
}
const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodNanoID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_nanoid(params) {
    return core._nanoid(ZodNanoID, params);
}
/**
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link ZodCUID2} instead.
 * See https://github.com/paralleldrive/cuid.
 */
const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodCUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
/**
 * Validates a CUID v1 string.
 *
 * @deprecated CUID v1 is deprecated by its authors due to information leakage
 * (timestamps embedded in the id). Use {@link cuid2 | `z.cuid2()`} instead.
 * See https://github.com/paralleldrive/cuid.
 */
function schemas_cuid(params) {
    return core._cuid(ZodCUID, params);
}
const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodCUID2.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_cuid2(params) {
    return core._cuid2(ZodCUID2, params);
}
const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodULID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_ulid(params) {
    return core._ulid(ZodULID, params);
}
const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodXID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_xid(params) {
    return core._xid(ZodXID, params);
}
const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodKSUID.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_ksuid(params) {
    return core._ksuid(ZodKSUID, params);
}
const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodIPv4.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_ipv4(params) {
    return core._ipv4(ZodIPv4, params);
}
const ZodMAC = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodMAC", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    core.$ZodMAC.init(inst, def);
    ZodStringFormat.init(inst, def);
})));
function schemas_mac(params) {
    return core._mac(ZodMAC, params);
}
const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodIPv6.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_ipv6(params) {
    return core._ipv6(ZodIPv6, params);
}
const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
    $ZodCIDRv4.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_cidrv4(params) {
    return core._cidrv4(ZodCIDRv4, params);
}
const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
    $ZodCIDRv6.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_cidrv6(params) {
    return core._cidrv6(ZodCIDRv6, params);
}
const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodBase64.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_base64(params) {
    return core._base64(ZodBase64, params);
}
const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodBase64URL.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_base64url(params) {
    return core._base64url(ZodBase64URL, params);
}
const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodE164.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function schemas_e164(params) {
    return core._e164(ZodE164, params);
}
const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    $ZodJWT.init(inst, def);
    ZodStringFormat.init(inst, def);
});
function jwt(params) {
    return core._jwt(ZodJWT, params);
}
const ZodCustomStringFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodCustomStringFormat", (inst, def) => {
    // ZodStringFormat.init(inst, def);
    core.$ZodCustomStringFormat.init(inst, def);
    ZodStringFormat.init(inst, def);
})));
function stringFormat(format, fnOrRegex, _params = {}) {
    return core._stringFormat(ZodCustomStringFormat, format, fnOrRegex, _params);
}
function schemas_hostname(_params) {
    return core._stringFormat(ZodCustomStringFormat, "hostname", core.regexes.hostname, _params);
}
function schemas_hex(_params) {
    return core._stringFormat(ZodCustomStringFormat, "hex", core.regexes.hex, _params);
}
function hash(alg, params) {
    const enc = params?.enc ?? "hex";
    const format = `${alg}_${enc}`;
    const regex = core.regexes[format];
    if (!regex)
        throw new Error(`Unrecognized hash format: ${format}`);
    return core._stringFormat(ZodCustomStringFormat, format, regex, params);
}
const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
    $ZodNumber.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
    _installLazyMethods(inst, "ZodNumber", {
        gt(value, params) {
            return this.check(_gt(value, params));
        },
        gte(value, params) {
            return this.check(_gte(value, params));
        },
        min(value, params) {
            return this.check(_gte(value, params));
        },
        lt(value, params) {
            return this.check(_lt(value, params));
        },
        lte(value, params) {
            return this.check(_lte(value, params));
        },
        max(value, params) {
            return this.check(_lte(value, params));
        },
        int(params) {
            return this.check(schemas_int(params));
        },
        safe(params) {
            return this.check(schemas_int(params));
        },
        positive(params) {
            return this.check(_gt(0, params));
        },
        nonnegative(params) {
            return this.check(_gte(0, params));
        },
        negative(params) {
            return this.check(_lt(0, params));
        },
        nonpositive(params) {
            return this.check(_lte(0, params));
        },
        multipleOf(value, params) {
            return this.check(_multipleOf(value, params));
        },
        step(value, params) {
            return this.check(_multipleOf(value, params));
        },
        finite() {
            return this;
        },
    });
    const bag = inst._zod.bag;
    inst.minValue =
        Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
    inst.maxValue =
        Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
    inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
    inst.isFinite = true;
    inst.format = bag.format ?? null;
});
function schemas_number(params) {
    return _number(ZodNumber, params);
}
const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
    $ZodNumberFormat.init(inst, def);
    ZodNumber.init(inst, def);
});
function schemas_int(params) {
    return _int(ZodNumberFormat, params);
}
function float32(params) {
    return core._float32(ZodNumberFormat, params);
}
function float64(params) {
    return core._float64(ZodNumberFormat, params);
}
function int32(params) {
    return core._int32(ZodNumberFormat, params);
}
function uint32(params) {
    return core._uint32(ZodNumberFormat, params);
}
const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
    $ZodBoolean.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function schemas_boolean(params) {
    return _boolean(ZodBoolean, params);
}
const ZodBigInt = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodBigInt", (inst, def) => {
    core.$ZodBigInt.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.bigintProcessor(inst, ctx, json, params);
    inst.gte = (value, params) => inst.check(checks.gte(value, params));
    inst.min = (value, params) => inst.check(checks.gte(value, params));
    inst.gt = (value, params) => inst.check(checks.gt(value, params));
    inst.gte = (value, params) => inst.check(checks.gte(value, params));
    inst.min = (value, params) => inst.check(checks.gte(value, params));
    inst.lt = (value, params) => inst.check(checks.lt(value, params));
    inst.lte = (value, params) => inst.check(checks.lte(value, params));
    inst.max = (value, params) => inst.check(checks.lte(value, params));
    inst.positive = (params) => inst.check(checks.gt(BigInt(0), params));
    inst.negative = (params) => inst.check(checks.lt(BigInt(0), params));
    inst.nonpositive = (params) => inst.check(checks.lte(BigInt(0), params));
    inst.nonnegative = (params) => inst.check(checks.gte(BigInt(0), params));
    inst.multipleOf = (value, params) => inst.check(checks.multipleOf(value, params));
    const bag = inst._zod.bag;
    inst.minValue = bag.minimum ?? null;
    inst.maxValue = bag.maximum ?? null;
    inst.format = bag.format ?? null;
})));
function schemas_bigint(params) {
    return core._bigint(ZodBigInt, params);
}
const ZodBigIntFormat = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodBigIntFormat", (inst, def) => {
    core.$ZodBigIntFormat.init(inst, def);
    ZodBigInt.init(inst, def);
})));
// int64
function int64(params) {
    return core._int64(ZodBigIntFormat, params);
}
// uint64
function uint64(params) {
    return core._uint64(ZodBigIntFormat, params);
}
const ZodSymbol = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodSymbol", (inst, def) => {
    core.$ZodSymbol.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.symbolProcessor(inst, ctx, json, params);
})));
function symbol(params) {
    return core._symbol(ZodSymbol, params);
}
const ZodUndefined = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodUndefined", (inst, def) => {
    core.$ZodUndefined.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.undefinedProcessor(inst, ctx, json, params);
})));
function schemas_undefined(params) {
    return core._undefined(ZodUndefined, params);
}

const ZodNull = /*@__PURE__*/ $constructor("ZodNull", (inst, def) => {
    $ZodNull.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nullProcessor(inst, ctx, json, params);
});
function schemas_null(params) {
    return api_null(ZodNull, params);
}

const ZodAny = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodAny", (inst, def) => {
    core.$ZodAny.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.anyProcessor(inst, ctx, json, params);
})));
function any() {
    return core._any(ZodAny);
}
const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
    $ZodUnknown.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
    return _unknown(ZodUnknown);
}
const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
    $ZodNever.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
    return _never(ZodNever, params);
}
const ZodVoid = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodVoid", (inst, def) => {
    core.$ZodVoid.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.voidProcessor(inst, ctx, json, params);
})));
function schemas_void(params) {
    return core._void(ZodVoid, params);
}

const ZodDate = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodDate", (inst, def) => {
    core.$ZodDate.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.dateProcessor(inst, ctx, json, params);
    inst.min = (value, params) => inst.check(checks.gte(value, params));
    inst.max = (value, params) => inst.check(checks.lte(value, params));
    const c = inst._zod.bag;
    inst.minDate = c.minimum ? new Date(c.minimum) : null;
    inst.maxDate = c.maximum ? new Date(c.maximum) : null;
})));
function schemas_date(params) {
    return core._date(ZodDate, params);
}
const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
    $ZodArray.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
    inst.element = def.element;
    _installLazyMethods(inst, "ZodArray", {
        min(n, params) {
            return this.check(_minLength(n, params));
        },
        nonempty(params) {
            return this.check(_minLength(1, params));
        },
        max(n, params) {
            return this.check(_maxLength(n, params));
        },
        length(n, params) {
            return this.check(_length(n, params));
        },
        unwrap() {
            return this.element;
        },
    });
});
function array(element, params) {
    return _array(ZodArray, element, params);
}
// .keyof
function keyof(schema) {
    const shape = schema._zod.def.shape;
    return schemas_enum(Object.keys(shape));
}
const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
    $ZodObjectJIT.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
    defineLazy(inst, "shape", () => {
        return def.shape;
    });
    _installLazyMethods(inst, "ZodObject", {
        keyof() {
            return schemas_enum(Object.keys(this._zod.def.shape));
        },
        catchall(catchall) {
            return this.clone({ ...this._zod.def, catchall: catchall });
        },
        passthrough() {
            return this.clone({ ...this._zod.def, catchall: unknown() });
        },
        loose() {
            return this.clone({ ...this._zod.def, catchall: unknown() });
        },
        strict() {
            return this.clone({ ...this._zod.def, catchall: never() });
        },
        strip() {
            return this.clone({ ...this._zod.def, catchall: undefined });
        },
        extend(incoming) {
            return extend(this, incoming);
        },
        safeExtend(incoming) {
            return safeExtend(this, incoming);
        },
        merge(other) {
            return merge(this, other);
        },
        pick(mask) {
            return pick(this, mask);
        },
        omit(mask) {
            return omit(this, mask);
        },
        partial(...args) {
            return partial(ZodOptional, this, args[0]);
        },
        required(...args) {
            return required(ZodNonOptional, this, args[0]);
        },
    });
});
function object(shape, params) {
    const def = {
        type: "object",
        shape: shape ?? {},
        ...normalizeParams(params),
    };
    return new ZodObject(def);
}
// strictObject
function strictObject(shape, params) {
    return new ZodObject({
        type: "object",
        shape,
        catchall: never(),
        ...util.normalizeParams(params),
    });
}
// looseObject
function looseObject(shape, params) {
    return new ZodObject({
        type: "object",
        shape,
        catchall: unknown(),
        ...util.normalizeParams(params),
    });
}
const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
    $ZodUnion.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
    inst.options = def.options;
});
function union(options, params) {
    return new ZodUnion({
        type: "union",
        options: options,
        ...normalizeParams(params),
    });
}
const ZodXor = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodXor", (inst, def) => {
    ZodUnion.init(inst, def);
    core.$ZodXor.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.unionProcessor(inst, ctx, json, params);
    inst.options = def.options;
})));
/** Creates an exclusive union (XOR) where exactly one option must match.
 * Unlike regular unions that succeed when any option matches, xor fails if
 * zero or more than one option matches the input. */
function xor(options, params) {
    return new ZodXor({
        type: "union",
        options: options,
        inclusive: false,
        ...util.normalizeParams(params),
    });
}
const ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("ZodDiscriminatedUnion", (inst, def) => {
    ZodUnion.init(inst, def);
    $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
    // const [options, params] = args;
    return new ZodDiscriminatedUnion({
        type: "union",
        options,
        discriminator,
        ...normalizeParams(params),
    });
}
const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
    $ZodIntersection.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
    return new ZodIntersection({
        type: "intersection",
        left: left,
        right: right,
    });
}
const ZodTuple = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodTuple", (inst, def) => {
    core.$ZodTuple.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.tupleProcessor(inst, ctx, json, params);
    inst.rest = (rest) => inst.clone({
        ...inst._zod.def,
        rest: rest,
    });
})));
function tuple(items, _paramsOrRest, _params) {
    const hasRest = _paramsOrRest instanceof core.$ZodType;
    const params = hasRest ? _params : _paramsOrRest;
    const rest = hasRest ? _paramsOrRest : null;
    return new ZodTuple({
        type: "tuple",
        items: items,
        rest,
        ...util.normalizeParams(params),
    });
}
const ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
    $ZodRecord.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
    // v3-compat: z.record(valueType, params?) — defaults keyType to z.string()
    if (!valueType || !valueType._zod) {
        return new ZodRecord({
            type: "record",
            keyType: schemas_string(),
            valueType: keyType,
            ...normalizeParams(valueType),
        });
    }
    return new ZodRecord({
        type: "record",
        keyType,
        valueType: valueType,
        ...normalizeParams(params),
    });
}
// type alksjf = core.output<core.$ZodRecordKey>;
function partialRecord(keyType, valueType, params) {
    const k = core.clone(keyType);
    k._zod.values = undefined;
    return new ZodRecord({
        type: "record",
        keyType: k,
        valueType: valueType,
        ...util.normalizeParams(params),
    });
}
function looseRecord(keyType, valueType, params) {
    return new ZodRecord({
        type: "record",
        keyType,
        valueType: valueType,
        mode: "loose",
        ...util.normalizeParams(params),
    });
}
const ZodMap = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodMap", (inst, def) => {
    core.$ZodMap.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.mapProcessor(inst, ctx, json, params);
    inst.keyType = def.keyType;
    inst.valueType = def.valueType;
    inst.min = (...args) => inst.check(core._minSize(...args));
    inst.nonempty = (params) => inst.check(core._minSize(1, params));
    inst.max = (...args) => inst.check(core._maxSize(...args));
    inst.size = (...args) => inst.check(core._size(...args));
})));
function map(keyType, valueType, params) {
    return new ZodMap({
        type: "map",
        keyType: keyType,
        valueType: valueType,
        ...util.normalizeParams(params),
    });
}
const ZodSet = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodSet", (inst, def) => {
    core.$ZodSet.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.setProcessor(inst, ctx, json, params);
    inst.min = (...args) => inst.check(core._minSize(...args));
    inst.nonempty = (params) => inst.check(core._minSize(1, params));
    inst.max = (...args) => inst.check(core._maxSize(...args));
    inst.size = (...args) => inst.check(core._size(...args));
})));
function set(valueType, params) {
    return new ZodSet({
        type: "set",
        valueType: valueType,
        ...util.normalizeParams(params),
    });
}
const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
    $ZodEnum.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
    inst.enum = def.entries;
    inst.options = Object.values(def.entries);
    const keys = new Set(Object.keys(def.entries));
    inst.extract = (values, params) => {
        const newEntries = {};
        for (const value of values) {
            if (keys.has(value)) {
                newEntries[value] = def.entries[value];
            }
            else
                throw new Error(`Key ${value} not found in enum`);
        }
        return new ZodEnum({
            ...def,
            checks: [],
            ...normalizeParams(params),
            entries: newEntries,
        });
    };
    inst.exclude = (values, params) => {
        const newEntries = { ...def.entries };
        for (const value of values) {
            if (keys.has(value)) {
                delete newEntries[value];
            }
            else
                throw new Error(`Key ${value} not found in enum`);
        }
        return new ZodEnum({
            ...def,
            checks: [],
            ...normalizeParams(params),
            entries: newEntries,
        });
    };
});
function schemas_enum(values, params) {
    const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
    return new ZodEnum({
        type: "enum",
        entries,
        ...normalizeParams(params),
    });
}

/** @deprecated This API has been merged into `z.enum()`. Use `z.enum()` instead.
 *
 * ```ts
 * enum Colors { red, green, blue }
 * z.enum(Colors);
 * ```
 */
function nativeEnum(entries, params) {
    return new ZodEnum({
        type: "enum",
        entries,
        ...util.normalizeParams(params),
    });
}
const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
    $ZodLiteral.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
    inst.values = new Set(def.values);
    Object.defineProperty(inst, "value", {
        get() {
            if (def.values.length > 1) {
                throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
            }
            return def.values[0];
        },
    });
});
function literal(value, params) {
    return new ZodLiteral({
        type: "literal",
        values: Array.isArray(value) ? value : [value],
        ...normalizeParams(params),
    });
}
const ZodFile = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodFile", (inst, def) => {
    core.$ZodFile.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.fileProcessor(inst, ctx, json, params);
    inst.min = (size, params) => inst.check(core._minSize(size, params));
    inst.max = (size, params) => inst.check(core._maxSize(size, params));
    inst.mime = (types, params) => inst.check(core._mime(Array.isArray(types) ? types : [types], params));
})));
function file(params) {
    return core._file(ZodFile, params);
}
const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
    $ZodTransform.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
    inst._zod.parse = (payload, _ctx) => {
        if (_ctx.direction === "backward") {
            throw new $ZodEncodeError(inst.constructor.name);
        }
        payload.addIssue = (issue) => {
            if (typeof issue === "string") {
                payload.issues.push(util_issue(issue, payload.value, def));
            }
            else {
                // for Zod 3 backwards compatibility
                const _issue = issue;
                if (_issue.fatal)
                    _issue.continue = false;
                _issue.code ?? (_issue.code = "custom");
                _issue.input ?? (_issue.input = payload.value);
                _issue.inst ?? (_issue.inst = inst);
                // _issue.continue ??= true;
                payload.issues.push(util_issue(_issue));
            }
        };
        const output = def.transform(payload.value, payload);
        if (output instanceof Promise) {
            return output.then((output) => {
                payload.value = output;
                payload.fallback = true;
                return payload;
            });
        }
        payload.value = output;
        payload.fallback = true;
        return payload;
    };
});
function transform(fn) {
    return new ZodTransform({
        type: "transform",
        transform: fn,
    });
}
const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
    return new ZodOptional({
        type: "optional",
        innerType: innerType,
    });
}
const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
    $ZodExactOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
    return new ZodExactOptional({
        type: "optional",
        innerType: innerType,
    });
}
const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
    $ZodNullable.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
    return new ZodNullable({
        type: "nullable",
        innerType: innerType,
    });
}
// nullish
function schemas_nullish(innerType) {
    return optional(nullable(innerType));
}
const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
    $ZodDefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeDefault = inst.unwrap;
});
function schemas_default(innerType, defaultValue) {
    return new ZodDefault({
        type: "default",
        innerType: innerType,
        get defaultValue() {
            return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
        },
    });
}
const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
    $ZodPrefault.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
    return new ZodPrefault({
        type: "prefault",
        innerType: innerType,
        get defaultValue() {
            return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
        },
    });
}
const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
    $ZodNonOptional.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
    return new ZodNonOptional({
        type: "nonoptional",
        innerType: innerType,
        ...normalizeParams(params),
    });
}
const ZodSuccess = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodSuccess", (inst, def) => {
    core.$ZodSuccess.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.successProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
})));
function success(innerType) {
    return new ZodSuccess({
        type: "success",
        innerType: innerType,
    });
}
const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
    $ZodCatch.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
    inst.removeCatch = inst.unwrap;
});
function schemas_catch(innerType, catchValue) {
    return new ZodCatch({
        type: "catch",
        innerType: innerType,
        catchValue: (typeof catchValue === "function" ? catchValue : () => catchValue),
    });
}

const ZodNaN = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodNaN", (inst, def) => {
    core.$ZodNaN.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.nanProcessor(inst, ctx, json, params);
})));
function nan(params) {
    return core._nan(ZodNaN, params);
}
const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
    $ZodPipe.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
    inst.in = def.in;
    inst.out = def.out;
});
function pipe(in_, out) {
    return new ZodPipe({
        type: "pipe",
        in: in_,
        out: out,
        // ...util.normalizeParams(params),
    });
}
const ZodCodec = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodCodec", (inst, def) => {
    ZodPipe.init(inst, def);
    core.$ZodCodec.init(inst, def);
})));
function codec(in_, out, params) {
    return new ZodCodec({
        type: "pipe",
        in: in_,
        out: out,
        transform: params.decode,
        reverseTransform: params.encode,
    });
}
function invertCodec(codec) {
    const def = codec._zod.def;
    return new ZodCodec({
        type: "pipe",
        in: def.out,
        out: def.in,
        transform: def.reverseTransform,
        reverseTransform: def.transform,
    });
}
const ZodPreprocess = /*@__PURE__*/ $constructor("ZodPreprocess", (inst, def) => {
    ZodPipe.init(inst, def);
    $ZodPreprocess.init(inst, def);
});
const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
    $ZodReadonly.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
    return new ZodReadonly({
        type: "readonly",
        innerType: innerType,
    });
}
const ZodTemplateLiteral = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodTemplateLiteral", (inst, def) => {
    core.$ZodTemplateLiteral.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.templateLiteralProcessor(inst, ctx, json, params);
})));
function templateLiteral(parts, params) {
    return new ZodTemplateLiteral({
        type: "template_literal",
        parts,
        ...util.normalizeParams(params),
    });
}
const ZodLazy = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodLazy", (inst, def) => {
    core.$ZodLazy.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.lazyProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.getter();
})));
function lazy(getter) {
    return new ZodLazy({
        type: "lazy",
        getter: getter,
    });
}
const ZodPromise = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodPromise", (inst, def) => {
    core.$ZodPromise.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.promiseProcessor(inst, ctx, json, params);
    inst.unwrap = () => inst._zod.def.innerType;
})));
function promise(innerType) {
    return new ZodPromise({
        type: "promise",
        innerType: innerType,
    });
}
const ZodFunction = /*@__PURE__*/ (/* unused pure expression or super */ null && (core.$constructor("ZodFunction", (inst, def) => {
    core.$ZodFunction.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => processors.functionProcessor(inst, ctx, json, params);
})));
function _function(params) {
    return new ZodFunction({
        type: "function",
        input: Array.isArray(params?.input) ? tuple(params?.input) : (params?.input ?? array(unknown())),
        output: params?.output ?? unknown(),
    });
}

const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
    $ZodCustom.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
// custom checks
function check(fn) {
    const ch = new core.$ZodCheck({
        check: "custom",
        // ...util.normalizeParams(params),
    });
    ch._zod.check = fn;
    return ch;
}
function custom(fn, _params) {
    return core._custom(ZodCustom, fn ?? (() => true), _params);
}
function refine(fn, _params = {}) {
    return _refine(ZodCustom, fn, _params);
}
// superRefine
function superRefine(fn, params) {
    return _superRefine(fn, params);
}
// Re-export describe and meta from core
const schemas_describe = describe;
const schemas_meta = meta;
function _instanceof(cls, params = {}) {
    const inst = new ZodCustom({
        type: "custom",
        check: "custom",
        fn: (data) => data instanceof cls,
        abort: true,
        ...util.normalizeParams(params),
    });
    inst._zod.bag.Class = cls;
    // Override check to emit invalid_type instead of custom
    inst._zod.check = (payload) => {
        if (!(payload.value instanceof cls)) {
            payload.issues.push({
                code: "invalid_type",
                expected: cls.name,
                input: payload.value,
                inst,
                path: [...(inst._zod.def.path ?? [])],
            });
        }
    };
    return inst;
}

// stringbool
const stringbool = (...args) => core._stringbool({
    Codec: ZodCodec,
    Boolean: ZodBoolean,
    String: ZodString,
}, ...args);
function json(params) {
    const jsonSchema = lazy(() => {
        return union([schemas_string(params), schemas_number(), schemas_boolean(), schemas_null(), array(jsonSchema), record(schemas_string(), jsonSchema)]);
    });
    return jsonSchema;
}
// preprocess
function preprocess(fn, schema) {
    return new ZodPreprocess({
        type: "pipe",
        in: transform(fn),
        out: schema,
    });
}

;// CONCATENATED MODULE: ./src/config.ts


const COMMAND_MODULES = ['lint', 'typecheck', 'tests', 'build'];
const MODULE_IDS = [
    'debug-logs',
    'secrets',
    ...COMMAND_MODULES,
    'pr-policy',
];
const DEFAULT_DEBUG_INCLUDE = ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'];
const DEFAULT_DEBUG_EXCLUDE = [
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '**/test/**',
    '**/tests/**',
    '**/__mocks__/**',
    '**/fixtures/**',
    '**/__fixtures__/**',
    '**/generated/**',
    '**/__generated__/**',
    '**/*.generated.*',
    '**/*.d.ts',
    '**/*.min.js',
    '**/vendor/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/docs/**',
    '**/examples/**',
    '**/stories/**',
    '**/*.stories.*',
];
const DEFAULT_DEBUG_PATTERNS = [
    'console.log',
    'console.debug',
    'console.info',
    'debugger',
];
const commandSchema = schemas_string().trim().min(1).max(2_000);
const globListSchema = array(schemas_string().trim().min(1).max(500)).max(200);
const repositoryPathSchema = schemas_string()
    .trim()
    .min(1)
    .max(500)
    .refine((path) => !path.startsWith('/') &&
    !path.split('/').includes('..') &&
    !path.includes(':'), { message: 'must be a path inside the repository' });
const checkNameSchema = schemas_string()
    .trim()
    .min(1)
    .max(200)
    .refine((name) => !isMergeReadinessName(name), {
    message: 'merge-readiness cannot require itself',
});
const qualityCheckSchema = object({
    checks: object({
        debugLogs: schemas_boolean(),
        secrets: schemas_boolean(),
        lint: schemas_boolean(),
        typecheck: schemas_boolean(),
        tests: schemas_boolean(),
        build: schemas_boolean(),
        prPolicy: schemas_boolean(),
        mergeReadiness: literal(true, {
            message: 'merge-readiness cannot be disabled',
        }),
    })
        .strict()
        .partial(),
    commands: object({
        install: union([commandSchema, literal(false)]),
        lint: commandSchema,
        typecheck: commandSchema,
        test: commandSchema,
        build: commandSchema,
    })
        .strict()
        .partial(),
    approvals: object({ minimum: schemas_number().int().min(0).max(100) })
        .strict()
        .partial(),
    forbiddenDebug: object({
        include: globListSchema.min(1),
        exclude: globListSchema,
        patterns: array(schemas_string()
            .trim()
            .min(1)
            .max(200)
            .regex(/^[\w$.]+$/, 'must be an identifier or a dotted path'))
            .min(1)
            .max(100),
    })
        .strict()
        .partial(),
    secrets: object({
        scope: schemas_enum(['diff', 'full']),
        baselinePath: repositoryPathSchema,
        configPath: repositoryPathSchema,
        gitleaksVersion: schemas_string()
            .regex(/^\d+\.\d+\.\d+$/, 'must be a version such as 8.28.0'),
    })
        .strict()
        .partial(),
    requiredChecks: array(checkNameSchema).max(50),
    mergeReadiness: object({ timeoutMinutes: schemas_number().int().min(0).max(120) })
        .strict()
        .partial(),
})
    .strict()
    .partial();
const configFileSchema = object({ qualityCheck: qualityCheckSchema.nullable() })
    .partial()
    .loose();
class ConfigError extends Error {
    field;
    constructor(field, message) {
        super(`${field}: ${message}`);
        this.field = field;
        this.name = 'ConfigError';
    }
}
function isMergeReadinessName(name) {
    return /(^|\/)\s*merge-readiness\s*$/i.test(name.trim());
}
function fieldPath(path) {
    return ['qualityCheck', ...path.map(String)].join('.');
}
// A zod message can quote the rejected value; a misplaced token in a config
// file must never be echoed into a public job summary.
function describeIssue(issue) {
    switch (issue.code) {
        case 'invalid_type':
            return `must be ${issue.expected}`;
        case 'unrecognized_keys': {
            const nameable = issue.keys.filter((key) => /^[A-Za-z][A-Za-z-]{0,23}$/.test(key));
            return nameable.length === issue.keys.length
                ? `unknown field${nameable.length === 1 ? '' : 's'} ${nameable.map((key) => `'${key}'`).join(', ')}`
                : 'contains an unknown field';
        }
        case 'too_small':
            return issue.origin === 'string'
                ? 'must not be empty'
                : `must be at least ${String(issue.minimum)}`;
        case 'too_big':
            return issue.origin === 'string'
                ? 'is too long'
                : `must be at most ${String(issue.maximum)}`;
        case 'invalid_value':
        case 'invalid_format':
        case 'invalid_union':
        case 'custom':
            return issue.message.includes('Invalid') ? 'is not valid' : issue.message;
        default:
            return 'is not valid';
    }
}
function parseQualityCheckConfig(source, fileName) {
    if (source === undefined)
        return {};
    let document;
    try {
        document = (0,dist/* parse */.qg)(source);
    }
    catch (error) {
        if (error instanceof dist/* YAMLParseError */.XT) {
            const line = error.linePos?.[0]?.line;
            throw new ConfigError(fileName, `is not valid YAML${line === undefined ? '' : ` (line ${line})`}`);
        }
        throw error;
    }
    if (document === null || document === undefined)
        return {};
    if (typeof document !== 'object' || Array.isArray(document)) {
        throw new ConfigError(fileName, 'must be a YAML mapping');
    }
    const file = configFileSchema.safeParse(document);
    if (!file.success) {
        const issue = file.error.issues[0];
        throw new ConfigError(issue.path.length === 0 ? fileName : issue.path.map(String).join('.'), describeIssue(issue));
    }
    const parsed = qualityCheckSchema.safeParse(file.data.qualityCheck ?? {});
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new ConfigError(fieldPath(issue.path), describeIssue(issue));
    }
    return parsed.data;
}

;// CONCATENATED MODULE: ./src/context.ts

function context_required(environment, name) {
    const value = environment[name]?.trim();
    if (!value)
        throw new Error(`${name} is required in the GitHub Actions context.`);
    return value;
}
const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
function readPullRequestContext(environment = process.env, readEvent = (path) => JSON.parse((0,external_node_fs_namespaceObject.readFileSync)(path, 'utf8'))) {
    const event = context_required(environment, 'GITHUB_EVENT_NAME');
    if (event !== 'pull_request') {
        throw new Error(`The quality-check suite runs on pull_request events only, not ${event}.`);
    }
    const payload = readEvent(context_required(environment, 'GITHUB_EVENT_PATH'));
    const pullRequest = payload.pull_request;
    const number = pullRequest?.number;
    const baseSha = pullRequest?.base?.sha;
    const headSha = pullRequest?.head?.sha;
    if (!Number.isInteger(number) ||
        typeof baseSha !== 'string' ||
        typeof headSha !== 'string' ||
        !SHA.test(baseSha) ||
        !SHA.test(headSha)) {
        throw new Error('The pull_request event payload is incomplete.');
    }
    const repo = context_required(environment, 'GITHUB_REPOSITORY');
    const headRepo = pullRequest?.head?.repo?.full_name;
    return {
        apiUrl: environment.GITHUB_API_URL?.trim() || 'https://api.github.com',
        baseSha,
        fromFork: headRepo !== repo,
        headSha,
        number: Number(number),
        repo,
        runAttempt: environment.GITHUB_RUN_ATTEMPT?.trim() || '1',
        runId: context_required(environment, 'GITHUB_RUN_ID'),
        serverUrl: environment.GITHUB_SERVER_URL?.trim() || 'https://github.com',
    };
}

;// CONCATENATED MODULE: ./src/glob.ts
function expandBraces(pattern) {
    const open = pattern.indexOf('{');
    if (open === -1)
        return [pattern];
    let depth = 0;
    for (let index = open; index < pattern.length; index += 1) {
        if (pattern[index] === '{')
            depth += 1;
        else if (pattern[index] === '}' && --depth === 0) {
            const head = pattern.slice(0, open);
            const tail = pattern.slice(index + 1);
            const options = [];
            let start = open + 1;
            let nested = 0;
            for (let cursor = open + 1; cursor < index; cursor += 1) {
                const character = pattern[cursor];
                if (character === '{')
                    nested += 1;
                else if (character === '}')
                    nested -= 1;
                else if (character === ',' && nested === 0) {
                    options.push(pattern.slice(start, cursor));
                    start = cursor + 1;
                }
            }
            options.push(pattern.slice(start, index));
            return options.flatMap((option) => expandBraces(`${head}${option}${tail}`));
        }
    }
    return [pattern];
}
function toRegExp(pattern) {
    let source = '';
    for (let index = 0; index < pattern.length; index += 1) {
        const character = pattern[index];
        if (character === '*') {
            if (pattern[index + 1] === '*') {
                const atSegmentStart = index === 0 || pattern[index - 1] === '/';
                const followedBySlash = pattern[index + 2] === '/';
                if (atSegmentStart && followedBySlash) {
                    source += '(?:[^/]*/)*';
                    index += 2;
                }
                else {
                    source += '.*';
                    index += 1;
                }
            }
            else {
                source += '[^/]*';
            }
        }
        else if (character === '?') {
            source += '[^/]';
        }
        else {
            source += character.replace(/[\\^$.|+()[\]{}]/g, '\\$&');
        }
    }
    return new RegExp(`^${source}$`);
}
function compileGlobs(patterns) {
    const expressions = patterns
        .flatMap(expandBraces)
        .map((pattern) => toRegExp(pattern.replace(/^\.\//, '')));
    return (path) => expressions.some((expression) => expression.test(path));
}

;// CONCATENATED MODULE: ./src/mask.ts
const REGEX_PRECEDING_KEYWORDS = new Set([
    'await',
    'case',
    'delete',
    'do',
    'else',
    'in',
    'instanceof',
    'new',
    'of',
    'return',
    'throw',
    'typeof',
    'void',
    'yield',
]);
function blank(character) {
    return character === '\n' || character === '\r' ? character : ' ';
}
/**
 * Returns the source with comments and the contents of string, template, and
 * regular-expression literals replaced by spaces. Line breaks are kept, so a
 * position in the result maps to the same line and column in the input, and
 * code inside `${...}` template substitutions stays visible.
 */
function maskNonCode(source) {
    let output = '';
    let index = 0;
    let previousToken = '';
    const templateDepths = [];
    let braceDepth = 0;
    const regexAllowed = () => previousToken === '' ||
        /[(,=:[!&|?{};+\-*%>~^]$/.test(previousToken) ||
        REGEX_PRECEDING_KEYWORDS.has(previousToken);
    const consumeTemplate = () => {
        while (index < source.length) {
            const character = source[index];
            if (character === '\\') {
                output += blank(character) + blank(source[index + 1] ?? '');
                index += 2;
            }
            else if (character === '`') {
                output += '`';
                index += 1;
                previousToken = '`';
                return;
            }
            else if (character === '$' && source[index + 1] === '{') {
                output += '${';
                index += 2;
                templateDepths.push(braceDepth);
                braceDepth += 1;
                previousToken = '{';
                return;
            }
            else {
                output += blank(character);
                index += 1;
            }
        }
    };
    while (index < source.length) {
        const character = source[index];
        const next = source[index + 1];
        if (character === '/' && next === '/') {
            while (index < source.length && source[index] !== '\n') {
                output += blank(source[index]);
                index += 1;
            }
            continue;
        }
        if (character === '/' && next === '*') {
            const end = source.indexOf('*/', index + 2);
            const stop = end === -1 ? source.length : end + 2;
            for (; index < stop; index += 1)
                output += blank(source[index]);
            continue;
        }
        if (character === '"' || character === "'") {
            output += character;
            index += 1;
            while (index < source.length && source[index] !== character) {
                if (source[index] === '\n')
                    break;
                if (source[index] === '\\') {
                    output += blank(source[index]);
                    index += 1;
                }
                if (index < source.length) {
                    output += blank(source[index]);
                    index += 1;
                }
            }
            if (source[index] === character) {
                output += character;
                index += 1;
            }
            previousToken = 'literal';
            continue;
        }
        if (character === '`') {
            output += '`';
            index += 1;
            consumeTemplate();
            continue;
        }
        if (character === '/' && regexAllowed()) {
            output += '/';
            index += 1;
            let inClass = false;
            while (index < source.length && source[index] !== '\n') {
                const current = source[index];
                if (current === '\\') {
                    output += blank(current) + blank(source[index + 1] ?? '');
                    index += 2;
                    continue;
                }
                if (current === '[')
                    inClass = true;
                else if (current === ']')
                    inClass = false;
                else if (current === '/' && !inClass)
                    break;
                output += blank(current);
                index += 1;
            }
            if (source[index] === '/') {
                output += '/';
                index += 1;
            }
            previousToken = 'literal';
            continue;
        }
        if (character === '{') {
            braceDepth += 1;
        }
        else if (character === '}') {
            braceDepth -= 1;
            if (templateDepths.at(-1) === braceDepth) {
                templateDepths.pop();
                output += '}';
                index += 1;
                consumeTemplate();
                continue;
            }
        }
        if (/[\w$]/.test(character)) {
            let end = index;
            while (end < source.length && /[\w$]/.test(source[end]))
                end += 1;
            const word = source.slice(index, end);
            output += word;
            index = end;
            previousToken = word;
            continue;
        }
        output += character;
        index += 1;
        if (!/\s/.test(character))
            previousToken = character;
    }
    return output;
}

;// CONCATENATED MODULE: ./src/debug-logs.ts


function patternExpression(pattern) {
    const body = pattern
        .split('.')
        .map((part) => part.replace(/\$/g, '\\$'))
        .join('\\s*\\.\\s*');
    const before = pattern.includes('.') ? '(?<![\\w$])' : '(?<![\\w$.])';
    return new RegExp(`${before}${body}(?![\\w$])`);
}
function selectScannedFiles(files, options) {
    const included = compileGlobs(options.include);
    const excluded = compileGlobs(options.exclude);
    return files.filter((file) => included(file.path) && !excluded(file.path));
}
function findDebugStatements(file, source, patterns) {
    const expressions = patterns.map((pattern) => ({
        expression: patternExpression(pattern),
        pattern,
    }));
    const lines = maskNonCode(source).split('\n');
    const findings = [];
    for (const line of [...file.addedLines].sort((a, b) => a - b)) {
        const code = lines[line - 1];
        if (code === undefined)
            continue;
        for (const { expression, pattern } of expressions) {
            if (expression.test(code)) {
                findings.push({ line, path: file.path, pattern });
                break;
            }
        }
    }
    return findings;
}

;// CONCATENATED MODULE: ./src/diff.ts
function unquotePath(raw) {
    if (!raw.startsWith('"'))
        return raw;
    return raw
        .slice(1, -1)
        .replace(/\\([\\"tn])/g, (_match, escaped) => escaped === 't' ? '\t' : escaped === 'n' ? '\n' : escaped);
}
function parseAddedLines(diff) {
    const files = [];
    let current;
    for (const line of diff.split('\n')) {
        if (line.startsWith('diff --git ')) {
            current = undefined;
            continue;
        }
        if (line.startsWith('+++ ')) {
            const target = line.slice(4);
            if (target === '/dev/null') {
                current = undefined;
                continue;
            }
            const path = unquotePath(target).replace(/^b\//, '');
            current = { addedLines: new Set(), path };
            files.push(current);
            continue;
        }
        const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (hunk && current) {
            const start = Number(hunk[1]);
            const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
            for (let offset = 0; offset < count; offset += 1)
                current.addedLines.add(start + offset);
        }
    }
    return files.filter((file) => file.addedLines.size > 0);
}

;// CONCATENATED MODULE: ./src/git.ts

function createGit(cwd = process.cwd()) {
    return (args) => (0,external_node_child_process_namespaceObject.execFileSync)('git', ['-c', 'core.quotePath=false', ...args], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}
function showFile(git, ref, path) {
    try {
        return git(['show', `${ref}:${path}`]);
    }
    catch {
        return undefined;
    }
}
function refReader(git, ref) {
    return {
        exists: (path) => showFile(git, ref, path) !== undefined,
        read: (path) => showFile(git, ref, path),
    };
}
function ensureCommits(git, shas) {
    const missing = shas.filter((sha) => {
        try {
            git(['cat-file', '-e', `${sha}^{commit}`]);
            return false;
        }
        catch {
            return true;
        }
    });
    if (missing.length === 0)
        return;
    try {
        git(['fetch', '--no-tags', '--quiet', 'origin', ...missing]);
    }
    catch {
        throw new Error('The pull request base and head commits are not available. Check out the repository with fetch-depth: 0.');
    }
}

;// CONCATENATED MODULE: ./src/github.ts
class GitHubApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'GitHubApiError';
    }
}
function createGitHubClient(apiUrl, token, fetcher = fetch, timeoutMs = 15_000) {
    const request = async (url) => {
        let response;
        try {
            response = await fetcher(url, {
                headers: {
                    accept: 'application/vnd.github+json',
                    authorization: `Bearer ${token}`,
                    'user-agent': 'qualitygate-quality-check',
                    'x-github-api-version': '2022-11-28',
                },
                signal: AbortSignal.timeout(timeoutMs),
            });
        }
        catch {
            throw new GitHubApiError(0, 'Could not reach the GitHub API.');
        }
        if (!response.ok) {
            throw new GitHubApiError(response.status, `GitHub API request failed with HTTP ${response.status}.`);
        }
        return response;
    };
    const absolute = (path) => path.startsWith('http') ? path : `${apiUrl.replace(/\/$/, '')}${path}`;
    return {
        async get(path) {
            return (await (await request(absolute(path))).json());
        },
        async paginate(path, pick) {
            const items = [];
            let next = absolute(path);
            for (let page = 0; next && page < 20; page += 1) {
                const response = await request(next);
                const body = await response.json();
                items.push(...(pick ? pick(body) : body));
                next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1];
            }
            return items;
        },
    };
}
function repoPath(repo) {
    const [owner, name] = repo.split('/');
    if (!owner || !name)
        throw new Error('Invalid GitHub repository.');
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

;// CONCATENATED MODULE: ../shared/dist/auth.js

const AUTH_ERROR_CODES = [
    'AUTH_REQUIRED',
    'EMAIL_UNVERIFIED',
    'INVALID_CREDENTIALS',
    'TOKEN_EXPIRED',
    'TOKEN_INVALID',
    'ORIGIN_FORBIDDEN',
    'IDENTITY_CONFLICT',
    'LAST_LOGIN_METHOD',
    'LAST_OWNER',
    'SELF_REMOVAL_FORBIDDEN',
    'ROLE_FORBIDDEN',
    'RATE_LIMITED',
    'VALIDATION_FAILED',
    'DELIVERY_FAILED',
    'BILLING_UNAVAILABLE',
    'BILLING_PROVIDER_FAILED',
    'CHECKOUT_INCOMPLETE',
    'SUBSCRIPTION_EXISTS',
    'GITHUB_INTEGRATION_UNAVAILABLE',
    'GITHUB_PROVIDER_FAILED',
    'GITHUB_CALLBACK_INVALID',
    'RESOURCE_NOT_FOUND',
    'REPOSITORY_ALREADY_CLAIMED',
    'PROJECT_LIMIT_REACHED',
    'EMAIL_VERIFICATION_REQUIRED',
    'EMAIL_MISMATCH',
    'INVITATION_INVALID',
    'INVITATION_EXPIRED',
    'INVITATION_REVOKED',
    'INVITATION_ALREADY_ACCEPTED',
    'INVITATION_NOT_FOUND',
    'MAIL_DELIVERY_FAILED',
    'REPORT_GENERATION_BUSY',
    'REPORT_GENERATION_FAILED',
    'PLAN_REQUIRED',
    'HOSTNAME_TAKEN',
    'HOSTNAME_RESERVED',
    'ACCOUNT_DELETION_BLOCKED',
];
const AuthErrorCodeSchema = schemas_enum(AUTH_ERROR_CODES);
const AuthErrorResponseSchema = object({
    error: object({
        code: AuthErrorCodeSchema,
        message: schemas_string().trim().min(1).max(300),
        fields: record(schemas_string(), schemas_string().trim().min(1).max(300))
            .optional(),
    })
        .strict(),
})
    .strict();
function validationFeedback(error, fallback = 'Check the submitted fields.') {
    const fields = {};
    for (const issue of error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !(field in fields)) {
            fields[field] = issue.message;
        }
    }
    const messages = Object.values(fields);
    return {
        fields,
        message: messages.length === 1
            ? messages[0]
            : messages.length > 1
                ? 'Fix the highlighted fields.'
                : fallback,
    };
}
const MembershipRoleSchema = schemas_enum(['owner', 'admin', 'member']);
const UpdateMemberRoleRequestSchema = object({ role: MembershipRoleSchema })
    .strict();
const MemberSummarySchema = object({
    id: schemas_string().uuid(),
    displayName: schemas_string(),
    email: schemas_string().trim().email(),
    role: MembershipRoleSchema,
})
    .strict();
const AuthProviderSchema = schemas_enum([
    'password',
    'github',
    'gitlab',
    'bitbucket',
]);
const OAuthProviderSchema = schemas_enum(['github', 'gitlab', 'bitbucket']);
const UserSummarySchema = object({
    id: schemas_string().uuid(),
    email: schemas_string().trim().email(),
    displayName: schemas_string().trim().min(1).max(120),
    identities: array(AuthProviderSchema).min(1),
})
    .strict();
const OrganizationSummarySchema = object({
    id: schemas_string().uuid(),
    name: schemas_string().trim().min(1).max(120),
    slug: schemas_string()
        .min(2)
        .max(63)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    role: MembershipRoleSchema,
})
    .strict();
const AnonymousSessionViewSchema = object({ authenticated: literal(false) })
    .strict();
const AuthenticatedSessionViewSchema = object({
    authenticated: literal(true),
    user: UserSummarySchema,
    organizations: array(OrganizationSummarySchema).min(1),
    activeOrganizationId: schemas_string().uuid(),
})
    .strict()
    .refine(({ activeOrganizationId, organizations }) => organizations.some(({ id }) => id === activeOrganizationId), {
    message: 'Active organization must be available to the user.',
    path: ['activeOrganizationId'],
});
const SessionViewSchema = discriminatedUnion('authenticated', [
    AnonymousSessionViewSchema,
    AuthenticatedSessionViewSchema,
]);
const EmailSchema = schemas_string({ error: 'Enter your email address.' })
    .trim()
    .email('Enter a valid email address.')
    .max(320, 'Use an email address of 320 characters or fewer.');
const PasswordSchema = schemas_string({ error: 'Enter a password.' })
    .min(12, 'Use at least 12 characters.')
    .max(1_024, 'Use 1,024 characters or fewer.');
const CurrentPasswordSchema = schemas_string({ error: 'Enter your password.' })
    .min(1, 'Enter your password.')
    .max(1_024, 'Use 1,024 characters or fewer.');
const DisplayNameSchema = schemas_string({ error: 'Enter your name.' })
    .trim()
    .min(1, 'Enter your name.')
    .max(120, 'Use 120 characters or fewer.');
const INVALID_LINK = 'This link is invalid. Request a new one.';
const ActionTokenSchema = schemas_string({ error: INVALID_LINK })
    .min(32, INVALID_LINK)
    .max(512, INVALID_LINK);
const SignupRequestSchema = object({
    email: EmailSchema,
    password: PasswordSchema,
    displayName: DisplayNameSchema,
    returnTo: schemas_string().max(2_048).optional(),
})
    .strict();
const LoginRequestSchema = object({ email: EmailSchema, password: CurrentPasswordSchema })
    .strict();
const EmailActionRequestSchema = object({ token: ActionTokenSchema })
    .strict();
const EmailRequestSchema = object({ email: EmailSchema }).strict();
const VerificationResendRequestSchema = object({ email: EmailSchema, returnTo: schemas_string().max(2_048).optional() })
    .strict();
const PasswordChangeRequestSchema = object({
    currentPassword: CurrentPasswordSchema,
    newPassword: PasswordSchema,
})
    .strict();
const PasswordResetRequestSchema = object({ token: ActionTokenSchema, newPassword: PasswordSchema })
    .strict();
const ProfileUpdateRequestSchema = object({ displayName: DisplayNameSchema })
    .strict();
const CreateOrganizationRequestSchema = object({ name: schemas_string().trim().min(1).max(120) })
    .strict();
const ActiveOrganizationRequestSchema = object({ organizationId: schemas_string().uuid() })
    .strict();
const AcceptedResponseSchema = object({ status: literal('accepted') })
    .strict();
//# sourceMappingURL=auth.js.map
;// CONCATENATED MODULE: ../shared/dist/account-privacy.js


const ACCOUNT_DELETION_GRACE_DAYS = 30;
const OrganizationReferenceSchema = object({ id: schemas_string().uuid(), name: schemas_string() })
    .strict();
const AccountDeletionStatusSchema = object({
    scheduledFor: schemas_string().datetime({ offset: true }).nullable(),
    // Organizations where this user is the only member. They are erased
    // together with the account.
    deletedOrganizations: array(OrganizationReferenceSchema),
    // Organizations this user solely owns that still have other members.
    // Deletion is refused until another member is made an owner.
    blockingOrganizations: array(OrganizationReferenceSchema),
})
    .strict();
const AccountDeletionRequestSchema = object({
    confirmEmail: EmailSchema,
    password: CurrentPasswordSchema.optional(),
})
    .strict();
const AccountDeletionScheduledSchema = object({ scheduledFor: schemas_string().datetime({ offset: true }) })
    .strict();
//# sourceMappingURL=account-privacy.js.map
;// CONCATENATED MODULE: ../shared/dist/billing.js

const BILLING_TIERS = ['developer', 'team', 'agency'];
const BillingTierSchema = schemas_enum(BILLING_TIERS);
const BillingCatalogItemSchema = object({
    currency: schemas_string().regex(/^[a-z]{3}$/),
    interval: schemas_enum(['day', 'week', 'month', 'year']),
    name: schemas_string().trim().min(1).max(120),
    tier: BillingTierSchema,
    unitAmount: schemas_number().int().positive(),
})
    .strict();
const BillingCatalogResponseSchema = object({ catalog: array(BillingCatalogItemSchema) })
    .strict();
const BillingSummarySchema = object({
    billingTier: BillingTierSchema.nullable(),
    cancelAtPeriodEnd: schemas_boolean(),
    catalog: array(BillingCatalogItemSchema),
    currentPeriodEnd: schemas_string().datetime().nullable(),
    customerLinked: schemas_boolean(),
    organizationId: schemas_string().uuid(),
    plan: schemas_string().trim().min(1).max(64),
    subscriptionLinked: schemas_boolean(),
})
    .strict();
const CreateCheckoutRequestSchema = object({ tier: BillingTierSchema })
    .strict();
const CreateCheckoutResponseSchema = object({
    // The embedded Checkout Session's client secret, passed opaquely to
    // Stripe.js to mount the payment form. Real secrets run a few hundred
    // characters and can contain characters like `%` outside \w — an
    // earlier ^cs_\w+$ regex here rejected a real, valid secret and broke
    // checkout in production. Only the "cs_" prefix and sane bounds are
    // ours to check; the rest is Stripe's opaque format to own.
    clientSecret: schemas_string().min(10).max(1000).startsWith('cs_'),
})
    .strict();
const ConfirmCheckoutRequestSchema = object({
    sessionId: schemas_string()
        .regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/)
        .max(255),
})
    .strict();
const ConfirmCheckoutResponseSchema = object({ linked: literal(true), summary: BillingSummarySchema })
    .strict();
const ChangeBillingTierRequestSchema = object({ tier: BillingTierSchema })
    .strict();
const ChangeBillingTierResponseSchema = object({ summary: BillingSummarySchema })
    .strict();
const CancelBillingSubscriptionResponseSchema = object({ summary: BillingSummarySchema })
    .strict();
const BILLING_ERROR_CODES = [
    'BILLING_UNAVAILABLE',
    'BILLING_PROVIDER_FAILED',
    'CHECKOUT_INCOMPLETE',
    'SUBSCRIPTION_EXISTS',
    'SUBSCRIPTION_NOT_FOUND',
    'SUBSCRIPTION_CANCELING',
];
const BillingErrorCodeSchema = schemas_enum(BILLING_ERROR_CODES);
//# sourceMappingURL=billing.js.map
;// CONCATENATED MODULE: ../shared/dist/billing-price.js
const ZERO_DECIMAL_CHARGE_CURRENCIES = new Set([
    'bif',
    'clp',
    'djf',
    'gnf',
    'jpy',
    'kmf',
    'krw',
    'mga',
    'pyg',
    'rwf',
    'vnd',
    'vuv',
    'xaf',
    'xof',
    'xpf',
]);
function formatBillingPrice(item, locale = 'en-US') {
    // Stripe keeps ISK and UGX in hundredths for compatibility despite their zero-decimal display.
    const divisor = ZERO_DECIMAL_CHARGE_CURRENCIES.has(item.currency) ? 1 : 100;
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: item.currency.toUpperCase(),
    }).format(item.unitAmount / divisor);
}
//# sourceMappingURL=billing-price.js.map
;// CONCATENATED MODULE: ../shared/dist/analysis.js

const ANALYSIS_LIMITS = {
    crawlPages: 25,
    hreflangPerPage: 50,
    jsonLdBlockChars: 10_000,
    jsonLdBlocksPerPage: 5,
    linksPerPage: 200,
    passageChars: 1_500,
    passages: 60,
    sitemapUrls: 200,
    textChars: 300,
    urlChars: 2_048,
};
const CollectedUrlSchema = schemas_string()
    .max(ANALYSIS_LIMITS.urlChars)
    .url()
    .regex(/^https?:\/\//);
const ShortTextSchema = schemas_string().max(ANALYSIS_LIMITS.textChars);
const JsonLdBlocksSchema = array(schemas_string().max(ANALYSIS_LIMITS.jsonLdBlockChars))
    .max(ANALYSIS_LIMITS.jsonLdBlocksPerPage);
const PassageSignalSchema = object({
    heading: ShortTextSchema.nullable(),
    selector: schemas_string().max(ANALYSIS_LIMITS.textChars).optional(),
    text: schemas_string().min(1).max(ANALYSIS_LIMITS.passageChars),
})
    .strict();
const GeoSignalsSchema = object({
    jsonLd: JsonLdBlocksSchema,
    passages: array(PassageSignalSchema).max(ANALYSIS_LIMITS.passages),
    url: CollectedUrlSchema,
})
    .strict();
const CrawledPageSchema = object({
    canonical: CollectedUrlSchema.nullable(),
    depth: schemas_number().int().min(0).max(10),
    hreflang: array(object({
        href: CollectedUrlSchema,
        lang: schemas_string().min(1).max(35),
    })
        .strict())
        .max(ANALYSIS_LIMITS.hreflangPerPage),
    jsonLd: JsonLdBlocksSchema,
    lang: schemas_string().max(35).nullable(),
    links: array(CollectedUrlSchema).max(ANALYSIS_LIMITS.linksPerPage),
    noindex: schemas_boolean(),
    status: schemas_number().int().min(0).max(599),
    title: ShortTextSchema.nullable(),
    url: CollectedUrlSchema,
})
    .strict();
const CrawlSignalsSchema = object({
    maxDepth: schemas_number().int().min(0).max(10),
    maxPages: schemas_number().int().min(1).max(ANALYSIS_LIMITS.crawlPages),
    pages: array(CrawledPageSchema).max(ANALYSIS_LIMITS.crawlPages),
    sitemapUrls: array(CollectedUrlSchema).max(ANALYSIS_LIMITS.sitemapUrls),
    startUrl: CollectedUrlSchema,
    truncated: schemas_boolean(),
})
    .strict();
const CollectedSignalsSchema = object({
    geo: GeoSignalsSchema.optional(),
    'seo-deep': CrawlSignalsSchema.optional(),
})
    .strict();
//# sourceMappingURL=analysis.js.map
;// CONCATENATED MODULE: ../shared/dist/contract.js


const CiProviderSchema = schemas_enum(['github', 'gitlab', 'bitbucket']);
const AuthorizeRunTriggerSchema = schemas_enum(['ci', 'scheduled']);
const RunTriggerSchema = schemas_enum(['ci', 'scheduled', 'manual']);
const RepositoryPathSchema = schemas_string()
    .trim()
    .regex(/^[^/\s]+(?:\/[^/\s]+)+$/, 'repo must use namespace/name format');
const BundleIdSchema = schemas_enum([
    'a11y',
    'ada',
    'seo',
    'security',
    'links',
    'full',
    'perf',
    'secrets-exposure',
    'geo',
    'seo-deep',
]);
const CheckIdSchema = schemas_enum([
    'a11y',
    'seo',
    'security-headers',
    'broken-links',
    'performance',
    'secrets-exposure',
    'geo',
    'seo-deep',
]);
// Which checks a bundle runs. The backend validates uploaded results against
// this without importing `core`, which would drag Playwright onto the server.
// A bundle is a profile over checks, so `ada` is the a11y check with a
// different rule set (ADR-0006) and shares its check id.
const contract_BUNDLE_CHECK_IDS = {
    a11y: ['a11y'],
    ada: ['a11y'],
    seo: ['seo'],
    security: ['security-headers'],
    links: ['broken-links'],
    // Every check that works from a single page load, in that one load.
    // Ordered cheapest-first: the three document reads finish before the link check
    // starts spending time on the network.
    full: ['a11y', 'seo', 'security-headers', 'broken-links'],
    // Deliberately outside `full`: Lighthouse loads the page several times and
    // adds tens of seconds, so it is opted into rather than folded into every
    // complete run (QG-P5-05).
    perf: ['performance'],
    'secrets-exposure': ['secrets-exposure'],
    geo: ['geo'],
    'seo-deep': ['seo-deep'],
};
const ANALYSIS_CHECK_IDS = new Set([
    'geo',
    'seo-deep',
]);
// Checks whose engine produces a natural 0-100 score (ADR-0008). Run history
// shows that score as-is; for every other check the backend derives the score
// from findings and ignores any score an uploader sends.
const NATURAL_SCORE_CHECK_IDS = new Set([
    'performance',
    'geo',
]);
const SeveritySchema = schemas_enum([
    'critical',
    'serious',
    'moderate',
    'minor',
]);
// Severity thresholds are check-agnostic: every check maps its findings onto the
// shared `Severity` scale, so one gate shape serves every bundle (ADR-0008).
/**
 * What the thresholds are counted against.
 *
 * `absolute` gates on every finding on the page. `regression` gates only on
 * findings this change introduced, which is the point of Phase 2: a team should
 * not be blocked by debt it did not create. In regression mode the same
 * `maxCritical` and `maxSerious` apply to the new findings, so there is one
 * spelling of a threshold rather than two.
 */
const FailOnModeSchema = schemas_enum(['absolute', 'regression']);
const contract_FailOnSchema = object({
    maxCritical: schemas_number().int().nonnegative(),
    maxSerious: schemas_number().int().nonnegative(),
    // Optional rather than defaulted, for the reason `dedupeProtocolVersion` is:
    // a client parses its own request before sending it, and a default would put
    // the field on the wire, where a backend deployed before regression mode
    // rejects it as an unknown key. Absent means absolute.
    mode: FailOnModeSchema.optional(),
})
    .strict();
const RequestedConfigSchema = object({
    bundle: BundleIdSchema,
    failOn: contract_FailOnSchema,
    engineVersion: schemas_string().trim().min(1).max(100),
    actionVersion: schemas_string().trim().min(1).max(100),
})
    .strict();
const DENY_REASONS = [
    'invalid_api_key',
    'key_revoked',
    'plan_inactive',
    'repo_not_allowed',
    'domain_not_allowed',
    'bundle_not_allowed',
    'quota_exceeded',
];
const DenyReasonSchema = schemas_enum(DENY_REASONS);
const HttpUrlSchema = schemas_string()
    .url()
    .regex(/^https?:\/\//, 'URL must use HTTP or HTTPS');
const AuthorizeRequestSchema = object({
    // Absent for a keyless run: a GitHub App project authorizes from its
    // signed OIDC token alone (QG-P5-04).
    apiKey: schemas_string().trim().min(1).max(512).optional(),
    provider: CiProviderSchema,
    repo: RepositoryPathSchema,
    commitSha: schemas_string().regex(/^[0-9a-f]{7,64}$/i),
    branch: schemas_string().trim().min(1).max(255),
    // Absent for a run that is establishing a baseline rather than reviewing a
    // pull request (QG-P2-07). There is nothing to comment on, so there is no
    // number to carry. Optional rather than nullable so an older Action, which
    // always sends one, is unaffected.
    pr: schemas_number().int().positive().optional(),
    url: HttpUrlSchema,
    requestedConfig: RequestedConfigSchema,
    // Older Actions send neither field. They wanted a comment, and protocol 0
    // is the legacy response shape, so those are the defaults.
    commentRequested: schemas_boolean().default(true),
    commentProtocolVersion: union([literal(0), literal(1)]).default(0),
    // Dedupe changes the shape of an allowed response, and every shipped Action
    // parses that response strictly, so a client has to say it understands the
    // new outcomes before it can be sent one. A client that says nothing gets
    // protocol 0, where every authorize is a fresh run.
    //
    // Optional rather than defaulted, unlike the comment protocol above. A
    // default materializes the field on parse, and a client that parses its own
    // request before sending it would then put this on the wire, where a
    // backend deployed before dedupe rejects it as an unknown field. The
    // absence has to survive all the way to the request body, so the only
    // clients sending it are the ones that mean it.
    dedupeProtocolVersion: union([literal(0), literal(1)]).optional(),
    // A GitHub-signed proof of which repository is calling (ADR-0011). The
    // Action self-reports `repo`, which a leaked key copied elsewhere can lie
    // about; this is the one claim the workflow author cannot forge. Optional,
    // because a workflow without `permissions: id-token: write` cannot mint one.
    oidcToken: schemas_string().trim().min(1).max(8192).optional(),
    // Optional rather than defaulted, for the reason `dedupeProtocolVersion`
    // is: only a scheduled run sends it. A backend that predates it drops the
    // key and counts the run as `ci`, which is the safe direction.
    trigger: AuthorizeRunTriggerSchema.optional(),
})
    // Deliberately not `.strict()`. The Action ships and updates independently of
    // this server, so a strict request schema means every field a newer client
    // adds is a hard rejection by an older deployment. That has now broken
    // production three times: the dedupe protocol, the regression mode flag, and
    // this token. Unknown keys are dropped instead, which is what lets a client
    // roll out ahead of a server. Every field the decision rests on is named
    // above, so nothing security-relevant rides on an unnamed key.
    .strip()
    .superRefine((request, context) => {
    if (request.apiKey === undefined) {
        if (request.provider !== 'github') {
            context.addIssue({
                code: 'custom',
                message: 'only GitHub runs can authorize without an API key',
                path: ['apiKey'],
            });
        }
        if (request.oidcToken === undefined) {
            context.addIssue({
                code: 'custom',
                message: 'a run without an API key must send an OIDC token',
                path: ['oidcToken'],
            });
        }
    }
    if (request.trigger !== 'scheduled')
        return;
    if (request.pr !== undefined) {
        context.addIssue({
            code: 'custom',
            message: 'a scheduled run has no pull request',
            path: ['pr'],
        });
    }
    if (request.commentRequested) {
        context.addIssue({
            code: 'custom',
            message: 'a scheduled run does not comment',
            path: ['commentRequested'],
        });
    }
});
const AuthorizeAllowedResponseSchema = object({
    allowed: literal(true),
    runId: schemas_string().uuid(),
    uploadToken: schemas_string().trim().min(1),
    effectiveConfig: RequestedConfigSchema,
    remainingRuns: schemas_number().int().nonnegative(),
})
    .strict();
const AuthorizeDeniedResponseSchema = object({
    allowed: literal(false),
    reason: DenyReasonSchema,
})
    .strict();
const IssueSchema = object({
    ruleId: schemas_string().trim().min(1),
    severity: SeveritySchema,
    message: schemas_string().trim().min(1),
    url: HttpUrlSchema,
    selector: schemas_string().trim().min(1).optional(),
    helpUrl: HttpUrlSchema.optional(),
})
    .strict();
const CheckResultSchema = object({
    // Deliberately an open string: which check ids are acceptable depends on the
    // authorized bundle, and the backend enforces that against BUNDLE_CHECK_IDS.
    // Closing it here would make adding a check a contract change (ADR-0004).
    checkId: schemas_string().trim().min(1),
    score: schemas_number().min(0).max(100).optional(),
    issues: array(IssueSchema),
})
    .strict();
const ReportRequestSchema = object({
    results: array(CheckResultSchema).min(1),
    // Only sent for analysis-tier bundles, which a backend that predates them
    // never authorizes, so its strict schema never meets this field.
    collected: CollectedSignalsSchema.optional(),
})
    .strict();
const IssueCountsSchema = object({
    critical: schemas_number().int().nonnegative(),
    serious: schemas_number().int().nonnegative(),
    moderate: schemas_number().int().nonnegative(),
    minor: schemas_number().int().nonnegative(),
})
    .strict();
// The verdict stays server-authoritative and shape-identical to protocol 0.
const GateVerdictSchema = object({
    passed: schemas_boolean(),
    failReason: schemas_string().trim().min(1).optional(),
    issueCounts: IssueCountsSchema,
})
    .strict();
const UsageSummarySchema = object({
    used: schemas_number().int().nonnegative(),
    limit: schemas_number().int().positive().nullable(),
    remaining: schemas_number().int().nonnegative().nullable(),
})
    .strict()
    .superRefine((usage, context) => {
    if (usage.limit === null) {
        if (usage.remaining !== null) {
            context.addIssue({
                code: 'custom',
                message: 'remaining must be null when limit is null',
            });
        }
        return;
    }
    if (usage.remaining === null) {
        context.addIssue({
            code: 'custom',
            message: 'remaining must be a number when limit is finite',
        });
        return;
    }
    if (usage.used > usage.limit ||
        usage.remaining !== usage.limit - usage.used) {
        context.addIssue({
            code: 'custom',
            message: 'finite usage counters are inconsistent',
        });
    }
});
// Protocol 1 outcomes (ADR-0009). `new_run` is the legacy shape plus the tag;
// the other two authorize the caller without reserving quota, because neither
// runs a scan, so neither should be billed for one.
const AuthorizeOutcomeSchema = schemas_enum([
    'new_run',
    'in_progress',
    'cached_report',
]);
const AuthorizeNewRunResponseSchema = AuthorizeAllowedResponseSchema.extend({
    outcome: literal('new_run'),
});
// No uploadToken: the caller has nothing to upload. Another run for the same
// key is already scanning, and duplicating its work would spend a second run
// of quota to compute the same verdict.
const AuthorizeInProgressResponseSchema = object({
    allowed: literal(true),
    outcome: literal('in_progress'),
    runId: schemas_string().uuid(),
    effectiveConfig: RequestedConfigSchema,
    remainingRuns: schemas_number().int().nonnegative(),
})
    .strict();
// The verdict is the one the server already recomputed and stored for the
// earlier run, so a cached answer is as server-authoritative as a fresh one.
const AuthorizeCachedReportResponseSchema = object({
    allowed: literal(true),
    outcome: literal('cached_report'),
    runId: schemas_string().uuid(),
    effectiveConfig: RequestedConfigSchema,
    remainingRuns: schemas_number().int().nonnegative(),
    verdict: GateVerdictSchema,
    usage: UsageSummarySchema,
})
    .strict();
// An Action must accept whichever backend answers it, and a protocol 0 client
// only ever sees the first and last members.
const AuthorizeResponseSchema = union([
    AuthorizeNewRunResponseSchema,
    AuthorizeInProgressResponseSchema,
    AuthorizeCachedReportResponseSchema,
    AuthorizeAllowedResponseSchema,
    AuthorizeDeniedResponseSchema,
]);
const CommentDeliverySchema = schemas_enum([
    'posted',
    'not_requested',
    'app_not_installed',
    'failed',
]);
// Protocol 0: exactly what every shipped Action already parses.
const LegacyReportResponseSchema = GateVerdictSchema;
// Protocol 1: the verdict plus what the backend did with the comment.
const AppCommentReportResponseSchema = GateVerdictSchema.extend({
    usage: UsageSummarySchema,
    commentDelivery: CommentDeliverySchema,
    // The analysed, authoritative results. Present only for analysis-tier
    // bundles, which only clients that understand this field can request.
    results: array(CheckResultSchema).optional(),
});
// The updated Action must accept whichever backend answers it.
const ReportResponseSchema = union([
    AppCommentReportResponseSchema,
    LegacyReportResponseSchema,
]);
const FailRequestSchema = object({
    errorKind: schemas_string().trim().min(1).max(100),
})
    .strict();
const FailResponseSchema = object({
    status: literal('failed'),
})
    .strict();
//# sourceMappingURL=contract.js.map
;// CONCATENATED MODULE: ../shared/dist/product-catalog.js

const PACKAGE_CATALOG = {
    free: {
        id: 'free',
        name: 'Free',
        runsPerMonth: 25,
        scheduledRunsPerMonth: 5,
        projectLimit: 1,
        bundles: ['a11y'],
        clientSharing: false,
        customReportDomain: false,
    },
    developer: {
        id: 'developer',
        name: 'Developer',
        runsPerMonth: 100,
        scheduledRunsPerMonth: 60,
        projectLimit: 3,
        bundles: BundleIdSchema.options,
        clientSharing: true,
        customReportDomain: false,
    },
    team: {
        id: 'team',
        name: 'Team',
        runsPerMonth: 1000,
        scheduledRunsPerMonth: 300,
        projectLimit: 10,
        bundles: BundleIdSchema.options,
        clientSharing: true,
        customReportDomain: false,
    },
    agency: {
        id: 'agency',
        name: 'Agency',
        runsPerMonth: 5000,
        scheduledRunsPerMonth: 1500,
        projectLimit: null,
        bundles: BundleIdSchema.options,
        clientSharing: true,
        customReportDomain: true,
    },
};
const BUNDLE_DETAILS = {
    a11y: {
        name: 'Accessibility',
        summary: "axe-core's default rules: missing alt text, contrast, labels and landmarks.",
        coverage: 'Checks the loaded page for image alternatives, text contrast, form labels, landmarks and other axe-core rules.',
        gate: 'Critical or serious accessibility findings.',
        note: 'Automated checks cannot prove that a page is fully accessible.',
    },
    ada: {
        name: 'WCAG A/AA',
        summary: 'The same engine limited to WCAG 2.0, 2.1 and 2.2 level A and AA.',
        coverage: 'Runs axe-core rules mapped to WCAG 2.0, 2.1 and 2.2 levels A and AA on the loaded page.',
        gate: 'Critical or serious findings from those WCAG rules.',
        note: 'This automated scan is not a legal or conformance assessment.',
    },
    seo: {
        name: 'On-page SEO',
        summary: 'Title, meta description, canonical, h1, viewport, robots and Open Graph tags.',
        coverage: 'Reads the page title, meta description, canonical URL, h1, viewport, robots directives and Open Graph tags.',
        gate: 'Serious issues such as a missing title, h1 or viewport. A noindex directive is reported only.',
    },
    security: {
        name: 'Security headers',
        summary: 'CSP, framing protection, nosniff, HSTS, Referrer-Policy and Permissions-Policy.',
        coverage: 'Checks the final response for CSP, framing protection, nosniff, HSTS, Referrer-Policy and Permissions-Policy headers.',
        gate: 'Plain HTTP, missing nosniff or missing framing protection. Missing CSP or HSTS is reported only.',
    },
    links: {
        name: 'Broken links',
        summary: 'Requests up to 100 links on the page and flags your own broken ones.',
        coverage: 'Requests up to 100 distinct links on this page; it does not crawl linked pages.',
        gate: 'Broken links to your own site. Broken external links are reported only.',
    },
    full: {
        name: 'Full page check',
        summary: 'a11y, seo, security and links in one page load, for one run.',
        coverage: 'Combines accessibility, on-page SEO, security headers and broken links in one page load.',
        gate: 'Critical or serious findings from any of those four checks.',
        note: 'One run. Performance, AI search, site crawl and exposed secrets are separate bundles.',
    },
    perf: {
        name: 'Performance',
        summary: 'Lighthouse on simulated mobile, median of three loads. Adds 15 to 30 seconds.',
        coverage: 'Runs Lighthouse three times with simulated mobile conditions and uses the median result.',
        gate: 'A core Lighthouse metric in the poor range. Metrics needing improvement are reported only.',
        note: 'Usually adds 15–30 seconds and is not included in Full page check.',
    },
    geo: {
        name: 'AI search readiness',
        summary: 'llms.txt, AI crawler access in robots.txt, JSON-LD and how quotable the page is.',
        coverage: 'Checks llms.txt, AI crawler access, JSON-LD structured data and how quotable the page text is.',
        gate: 'JSON-LD that is not valid JSON. Blocked AI crawlers are reported only.',
        note: 'Readiness checks do not guarantee AI citations or rankings.',
    },
    'seo-deep': {
        name: 'Site SEO crawl',
        summary: 'Crawls up to 25 pages: broken internal links, canonicals, hreflang and orphans.',
        coverage: 'Crawls up to 25 same-origin pages, checking internal links, canonicals, hreflang, JSON-LD, duplicate titles and orphan pages.',
        gate: 'Internal links to error pages, broken canonicals or invalid JSON-LD.',
        note: 'The crawl goes at most three clicks deep and reports when it reaches a limit.',
    },
    'secrets-exposure': {
        name: 'Exposed secrets',
        summary: 'Server-side credentials that reach the browser.',
        coverage: 'Inspects the page and up to 40 same-origin scripts or JSON files for server-side credentials exposed to browsers.',
        gate: 'Any exposed server-side credential. Public browser keys are excluded.',
        note: 'Rotate a credential if it has already been exposed.',
    },
};
const BUNDLE_GROUPS = [
    {
        id: 'accessibility',
        name: 'Accessibility',
        description: 'Automated accessibility checks and the WCAG A/AA profile. These checks are not a legal or conformance assessment.',
        bundleIds: ['a11y', 'ada'],
    },
    {
        id: 'release-quality',
        name: 'Release quality',
        description: 'Page SEO, security headers, broken links and exposed credentials. full combines accessibility, SEO, security and links; advanced scans run separately.',
        bundleIds: ['seo', 'security', 'links', 'full', 'secrets-exposure'],
    },
    {
        id: 'performance-search',
        name: 'Performance and search visibility',
        description: 'Lighthouse performance, deterministic AI-search readiness and bounded site-level SEO. No rankings or AI citations are guaranteed.',
        bundleIds: ['perf', 'geo', 'seo-deep'],
    },
];
const PRODUCT_FEATURES = [
    {
        id: 'scans',
        name: 'Ten scan bundles',
        description: 'Choose accessibility, release quality, performance and search visibility checks for each URL.',
        docsPath: '/docs/bundles',
    },
    {
        id: 'integrations',
        name: 'GitHub, GitLab and Bitbucket',
        description: 'Run checks in your CI pipeline and publish findings on pull or merge requests.',
        docsPath: '/docs/features',
    },
    {
        id: 'gates',
        name: 'Regression gates',
        description: 'Compare against a baseline and gate changes on new findings or absolute severity limits.',
        docsPath: '/docs/gates-and-regressions',
    },
    {
        id: 'cli',
        name: 'Local CLI',
        description: 'Scan locally with text or JSON results and exit codes for automation.',
        docsPath: '/docs/quickstart',
    },
    {
        id: 'cloud',
        name: 'Cloud scans',
        description: 'Queue public HTTPS scans from your project and follow their progress in the app.',
        docsPath: '/docs/cloud-scans',
    },
    {
        id: 'scheduling',
        name: 'Scheduled scans',
        description: 'Check projects on a recurring schedule using a separate monthly allowance.',
        docsPath: '/docs/scheduled-scans',
    },
    {
        id: 'quality-suite',
        name: 'Repository quality checks',
        description: 'Combine secret detection, lint, types, tests, build and PR policy with merge readiness.',
        docsPath: '/docs/merge-readiness',
    },
    {
        id: 'accounts',
        name: 'Account access',
        description: 'Use email or GitHub, GitLab and Bitbucket sign-in, with connected methods and session controls.',
        docsPath: '/docs/account-setup',
    },
    {
        id: 'organizations',
        name: 'Organizations and roles',
        description: 'Invite teammates, assign roles and switch between organization workspaces.',
        docsPath: '/docs/account-setup',
    },
    {
        id: 'projects',
        name: 'Project controls',
        description: 'Configure repositories, allowed hosts, default branches and scoped API keys.',
        docsPath: '/docs/account-setup',
    },
    {
        id: 'billing-usage',
        name: 'Packages and usage',
        description: 'Review scan allowances, reserved runs and your subscription in the app.',
        docsPath: '/docs/pricing-and-packages',
    },
    {
        id: 'dashboard',
        name: 'Run history and findings',
        description: 'Review project trends, scan outcomes, selectors and guidance for individual findings.',
        docsPath: '/docs/reports-and-notifications',
    },
    {
        id: 'reports-sharing',
        name: 'Reports and client sharing',
        description: 'Export branded HTML and PDF reports. Paid packages add private client links; Agency adds custom report domains.',
        docsPath: '/docs/reports-and-notifications',
    },
    {
        id: 'notifications',
        name: 'Email and Slack notifications',
        description: 'Receive gate failures, quota alerts and weekly digests through your configured channels.',
        docsPath: '/docs/reports-and-notifications',
    },
];
//# sourceMappingURL=product-catalog.js.map
;// CONCATENATED MODULE: ../shared/dist/cloud-execution.js


const ExecutionModeSchema = schemas_enum(['customer_ci', 'cloud']);
const CloudScanUrlSchema = schemas_string()
    .url()
    .superRefine((value, context) => {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
        context.addIssue({
            code: 'custom',
            message: 'cloud scan URL must use HTTPS',
        });
    }
    if (url.username || url.password) {
        context.addIssue({
            code: 'custom',
            message: 'cloud scan URL must not contain credentials',
        });
    }
    if (url.hash) {
        context.addIssue({
            code: 'custom',
            message: 'cloud scan URL must not contain a fragment',
        });
    }
});
const StartCloudScanRequestSchema = object({
    bundle: BundleIdSchema,
    failOn: contract_FailOnSchema,
    url: CloudScanUrlSchema,
})
    .strict();
const StartCloudScanResponseSchema = object({
    remainingRuns: schemas_number().int().nonnegative(),
    runId: schemas_string().uuid(),
    status: literal('queued'),
})
    .strict();
//# sourceMappingURL=cloud-execution.js.map
;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = require("node:crypto");
;// CONCATENATED MODULE: ../shared/dist/fingerprint.js

/**
 * Bumped whenever normalization changes. A stored baseline records the version
 * its fingerprints were computed with, and a diff across versions must be
 * treated as "no baseline" rather than "everything is new" (QG-P2-03). Without
 * this, shipping a normalization improvement would mark every existing issue as
 * newly introduced and fail every open pull request at once.
 */
const FINGERPRINT_VERSION = 'v1';
/**
 * How many segments of a selector survive normalization: the element itself,
 * plus up to two identifying ancestors.
 *
 * Only ancestors carrying an id count towards it. An id is the one thing about
 * an ancestor that is both stable across builds and meant to identify
 * something; classes are routinely generated, reordered, or added by a layout
 * change. Keeping a fixed count of nearest ancestors instead was the obvious
 * first design and it does not work: it absorbs a new wrapper only when the
 * chain is long enough to push the wrapper out of the window, so on the short
 * selectors axe usually emits, adding one layout div still rewrites the
 * identity of every finding beneath it.
 *
 * The cost is that two findings of the same rule on the same page, whose
 * elements normalize alike and share no id-bearing ancestor, collapse into one
 * identity. That is the deliberate trade: for the checks shipped here such a
 * pair is nearly always the same defect with the same fix, whereas churn in
 * the other direction fails pull requests that changed nothing.
 */
const SELECTOR_SEGMENT_LIMIT = 3;
/**
 * Class and id tokens generated by a build rather than written by a person.
 * These change on every deploy, so leaving them in would make every issue look
 * new on every scan.
 *
 * The list is deliberately explicit. An over-eager rule is worse than a missing
 * one: dropping a meaningful token merges two distinct issues into one
 * fingerprint, and a genuinely new issue then reports as pre-existing, which is
 * the one failure this feature exists to prevent.
 */
const GENERATED_TOKEN_PATTERNS = (/* unused pure expression or super */ null && ([
    /^sc-[A-Za-z0-9]{5,}$/, // styled-components
    /^css-[a-z0-9]{5,}$/, // emotion
    /^_?ng(content|host)-/, // Angular view encapsulation
    /^jsx-\d+$/, // styled-jsx
    /^svelte-[a-z0-9]{5,}$/, // Svelte scoped styles
    /__[A-Za-z0-9]{5,}$/, // CSS modules: Button_root__x7f3a
    /^[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9]{5,}$/, // CSS modules, short form
]));
/**
 * A hex-looking run long enough to be a content hash. Requiring a digit keeps
 * ordinary words out: "feedface" is hex, "checkout" is not, and neither should
 * be mistaken for a build artifact on length alone.
 */
const HASH_RUN = /[0-9a-f]{6,}/i;
function looksGenerated(token) {
    if (GENERATED_TOKEN_PATTERNS.some((pattern) => pattern.test(token))) {
        return true;
    }
    const match = HASH_RUN.exec(token);
    return match !== null && /\d/.test(match[0]);
}
function parseSegment(segment) {
    const parsed = {
        attributes: [],
        classes: [],
        id: undefined,
        tag: undefined,
    };
    // One pass over the segment, because a class value can contain characters
    // that a split on "." would tear apart inside an attribute value.
    const pattern = /(\[[^\]]*\])|(:{1,2}[A-Za-z-]+(?:\([^)]*\))?)|([#.]?[^#.:[\]]+)/g;
    for (const [token] of segment.matchAll(pattern)) {
        if (token.startsWith('[')) {
            parsed.attributes.push(token);
            continue;
        }
        // Pseudo-classes are dropped wholesale. `:nth-child` is the single largest
        // source of churn, since inserting any sibling renumbers everything after
        // it, and the state pseudos axe can emit say nothing about identity.
        if (token.startsWith(':'))
            continue;
        if (token.startsWith('#')) {
            const id = token.slice(1);
            if (!looksGenerated(id))
                parsed.id = id;
            continue;
        }
        if (token.startsWith('.')) {
            const className = token.slice(1);
            if (!looksGenerated(className))
                parsed.classes.push(className);
            continue;
        }
        parsed.tag = token.toLowerCase();
    }
    return parsed;
}
function normalizeAttribute(attribute) {
    // Quote style is a serialization detail of whoever built the selector, not a
    // property of the element.
    const match = /^\[([^=\]]+)(?:([~|^$*]?=)["']?([^"'\]]*)["']?)?\]$/.exec(attribute);
    if (!match)
        return attribute;
    const [, name, operator, value] = match;
    const lowered = name?.trim().toLowerCase() ?? '';
    // Vue's scoped-style marker is a build artifact wearing an attribute's
    // clothes, so it is dropped the way a generated class would be.
    if (lowered.startsWith('data-v-'))
        return '';
    if (operator === undefined)
        return `[${lowered}]`;
    return `[${lowered}${operator}"${value ?? ''}"]`;
}
function normalizeSegment(segment) {
    const parsed = parseSegment(segment);
    const attributes = parsed.attributes
        .map(normalizeAttribute)
        .filter((attribute) => attribute.length > 0)
        .sort();
    // Class order in a selector carries no meaning, so two spellings of the same
    // element must not produce two fingerprints.
    const classes = [...parsed.classes].sort();
    const rendered = [
        parsed.tag ?? '',
        parsed.id === undefined ? '' : `#${parsed.id}`,
        classes.map((className) => `.${className}`).join(''),
        attributes.join(''),
    ].join('');
    return rendered.length === 0 ? '*' : rendered;
}
/**
 * Reduces a CSS selector to the part of it that identifies an element across
 * builds. Pure and exported so the rules can be tested directly, since every
 * regression verdict rests on them.
 */
function normalizeSelector(selector) {
    const trimmed = selector?.trim() ?? '';
    if (trimmed.length === 0)
        return '';
    const segments = trimmed
        .split(/\s*[>+~]\s*|\s+/)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .map(normalizeSegment);
    const leaf = segments.at(-1);
    if (leaf === undefined)
        return '';
    // Nearest first, so the ancestors kept are the ones closest to the element,
    // then put back in document order for a readable, stable rendering.
    const identifyingAncestors = segments
        .slice(0, -1)
        .filter((segment) => segment.includes('#'))
        .slice(-(SELECTOR_SEGMENT_LIMIT - 1));
    return [...identifyingAncestors, leaf].join('>');
}
/**
 * The page a finding is on, independent of where that page is deployed.
 *
 * The origin is deliberately excluded. A baseline is captured on the target
 * branch's deployment and compared against a pull request's preview, which is a
 * different host by construction; including the origin would make every issue
 * new on every pull request. Which deployment was scanned is already recorded
 * by the baseline key, so nothing is lost here.
 */
function normalizePagePath(url) {
    let path;
    try {
        path = new URL(url).pathname;
    }
    catch {
        path = url.trim();
    }
    const withoutIndex = path.replace(/\/index\.html?$/i, '/');
    const collapsed = withoutIndex.replace(/\/{2,}/g, '/');
    const trimmed = collapsed.replace(/\/+$/, '');
    return trimmed.length === 0 ? '/' : trimmed;
}
/**
 * A stable identity for one finding, so the same issue seen on two scans of the
 * same page produces the same value and a diff can tell "still there" from
 * "newly introduced" (QG-P2-01).
 *
 * Parts are joined with a separator that cannot occur inside any of them, so
 * two different findings cannot collide by their fields running together.
 */
function fingerprint_fingerprintIssue(checkId, issue) {
    return createHash('sha256')
        .update([
        FINGERPRINT_VERSION,
        checkId,
        issue.ruleId,
        normalizeSelector(issue.selector),
        normalizePagePath(issue.url),
    ].join('\n'))
        .digest('hex');
}
function fingerprint_fingerprintResults(results) {
    return results.flatMap(({ checkId, issues }) => issues.map((issue) => ({
        checkId,
        fingerprint: fingerprint_fingerprintIssue(checkId, issue),
        issue,
    })));
}
//# sourceMappingURL=fingerprint.js.map
;// CONCATENATED MODULE: ../shared/dist/diff.js

function emptyIssueCounts() {
    return { critical: 0, serious: 0, moderate: 0, minor: 0 };
}
function countBySeverity(issues) {
    return issues.reduce((counts, { issue }) => {
        counts[issue.severity] += 1;
        return counts;
    }, emptyIssueCounts());
}
/**
 * Reduces findings to one entry per identity.
 *
 * The diff works on distinct fingerprints rather than on raw instances. Two
 * findings that normalize to the same identity are the same issue as far as
 * this feature is concerned, and counting them separately would reintroduce the
 * churn the normalization exists to remove: a list growing by one row would
 * otherwise report a new issue on every item that shares its shape.
 */
function distinct(issues) {
    const seen = new Map();
    for (const entry of issues) {
        if (!seen.has(entry.fingerprint))
            seen.set(entry.fingerprint, entry);
    }
    return [...seen.values()];
}
/**
 * Classifies this scan's findings against the baseline's (QG-P2-03).
 *
 * When there is no usable baseline, every finding is reported as `existing` and
 * `comparedToBaseline` is false. That default is deliberate and it is the safe
 * direction: without evidence of what the page looked like before, nothing can
 * be shown to have got worse, and a gate must not fail a pull request over a
 * backlog it cannot prove the request created. The flag exists so a report can
 * say "no baseline yet" instead of claiming a measured zero.
 */
function diffScan(current, baseline) {
    const currentIssues = distinct(fingerprintResults(current));
    if (baseline === undefined) {
        return {
            comparedToBaseline: false,
            newIssues: [],
            existingIssues: currentIssues,
            fixedIssues: [],
            counts: { new: 0, existing: currentIssues.length, fixed: 0 },
            newIssueCounts: emptyIssueCounts(),
        };
    }
    const baselineIssues = distinct(fingerprintResults(baseline));
    const baselineFingerprints = new Set(baselineIssues.map(({ fingerprint }) => fingerprint));
    const currentFingerprints = new Set(currentIssues.map(({ fingerprint }) => fingerprint));
    const newIssues = currentIssues.filter(({ fingerprint }) => !baselineFingerprints.has(fingerprint));
    const existingIssues = currentIssues.filter(({ fingerprint }) => baselineFingerprints.has(fingerprint));
    // Reported from the baseline's own record of them, because a fixed finding is
    // by definition not in this scan to report from.
    const fixedIssues = baselineIssues.filter(({ fingerprint }) => !currentFingerprints.has(fingerprint));
    return {
        comparedToBaseline: true,
        newIssues,
        existingIssues,
        fixedIssues,
        counts: {
            new: newIssues.length,
            existing: existingIssues.length,
            fixed: fixedIssues.length,
        },
        newIssueCounts: countBySeverity(newIssues),
    };
}
//# sourceMappingURL=diff.js.map
;// CONCATENATED MODULE: ../shared/dist/fail-on.js

/** The word that switches thresholds from the whole page to what changed. */
const REGRESSION_KEYWORD = 'regression';
/**
 * Parses the threshold spelling both the Action input and the CLI flag use. It
 * lives in `shared` because the two front ends must agree on it exactly: a
 * threshold that parses one way in CI and another way on a laptop makes the
 * local run a liar about what the pipeline will do.
 *
 * `critical=N,serious=N` gates on every finding on the page.
 * `regression` gates only on findings the change introduced, with the same
 * threshold spelling applying to those: `regression,critical=1` allows one new
 * critical issue. Bare `regression` allows none.
 *
 * @param value the threshold spec, for example `critical=0,serious=2`
 * @param source what to name in the error message, for example `fail_on`
 */
function parseFailOn(value, source) {
    const entries = value.split(',').map((entry) => entry.trim());
    const regression = entries[0]?.toLowerCase() === REGRESSION_KEYWORD;
    const thresholdEntries = regression ? entries.slice(1) : entries;
    const thresholds = new Map();
    for (const entry of thresholdEntries) {
        const [rawName, rawValue, ...extra] = entry.split('=');
        const name = rawName?.trim().toLowerCase();
        const threshold = Number(rawValue?.trim());
        if (extra.length > 0 ||
            (name !== 'critical' && name !== 'serious') ||
            !Number.isInteger(threshold) ||
            threshold < 0 ||
            thresholds.has(name)) {
            throw new Error(`${source} must use 'critical=N,serious=N' or 'regression', with non-negative integers.`);
        }
        thresholds.set(name, threshold);
    }
    // Regression mode defaults both thresholds to zero, so bare `regression` is
    // the common case: fail on anything this change introduced, and nothing else.
    const maxCritical = thresholds.get('critical') ?? (regression ? 0 : undefined);
    const maxSerious = thresholds.get('serious') ?? (regression ? 0 : undefined);
    // Absolute mode requires both, rather than defaulting one: a spec that names
    // one and silently accepts a default for the other hides which gate is in
    // force. Checked here so a missing one reports the spelling, not a schema error.
    if (maxCritical === undefined || maxSerious === undefined) {
        throw new Error(`${source} must use 'critical=N,serious=N' or 'regression', with non-negative integers.`);
    }
    return FailOnSchema.parse({
        maxCritical,
        maxSerious,
        // Optional on purpose: absent means absolute, and absent is what stays off
        // the wire for a backend deployed before regression mode existed.
        ...(regression ? { mode: 'regression' } : {}),
    });
}
//# sourceMappingURL=fail-on.js.map
;// CONCATENATED MODULE: ../shared/dist/gate.js
const DEFAULT_FAIL_ON = {
    maxCritical: 0,
    maxSerious: 0,
};
function gate_emptyIssueCounts() {
    return { critical: 0, serious: 0, moderate: 0, minor: 0 };
}
function countIssues(results) {
    return results.reduce((counts, result) => {
        for (const issue of result.issues)
            counts[issue.severity] += 1;
        return counts;
    }, gate_emptyIssueCounts());
}
function exceeded(severity, count, maximum, regression) {
    const noun = count === 1 ? 'issue' : 'issues';
    const kind = regression ? `new ${severity}` : severity;
    return `${count} ${kind} ${noun} (max ${maximum})`;
}
/**
 * The deterministic gate over a run (ADR-0008). Counts are summed across every
 * check, because the gate answers one question about the run rather than one
 * question per check.
 *
 * In regression mode the thresholds apply to what this change introduced rather
 * than to everything on the page (QG-P2-04). Absolute counts are still reported;
 * they simply stop deciding the verdict.
 *
 * A regression run with no comparison passes. `diffScan` reports no new findings
 * when it had no usable baseline, and that is the safe direction: nothing can be
 * shown to have got worse without evidence of what came before, so the build is
 * not failed over a backlog this change cannot be shown to have created.
 */
function evaluateGate(results, failOn = DEFAULT_FAIL_ON, diff) {
    if (results.length === 0) {
        throw new TypeError('Gate evaluation requires at least one check result');
    }
    const issueCounts = countIssues(results);
    const regression = failOn.mode === 'regression';
    if (regression && diff === undefined) {
        throw new TypeError('Regression gating requires a diff');
    }
    const gated = regression && diff ? diff.newIssueCounts : issueCounts;
    const failures = [];
    if (gated.critical > failOn.maxCritical) {
        failures.push(exceeded('critical', gated.critical, failOn.maxCritical, regression));
    }
    if (gated.serious > failOn.maxSerious) {
        failures.push(exceeded('serious', gated.serious, failOn.maxSerious, regression));
    }
    return failures.length === 0
        ? { issueCounts, passed: true }
        : { issueCounts, passed: false, failReason: failures.join('; ') };
}
//# sourceMappingURL=gate.js.map
;// CONCATENATED MODULE: ../shared/dist/invitations.js


const InvitationRoleSchema = schemas_enum(['admin', 'member']);
const CreateOrganizationInvitationRequestSchema = object({ email: EmailSchema, role: InvitationRoleSchema })
    .strict();
const OrganizationInvitationSummarySchema = object({
    email: EmailSchema,
    expiresAt: iso_datetime(),
    id: schemas_string().uuid(),
    inviterDisplayName: schemas_string().trim().min(1).max(120),
    role: InvitationRoleSchema,
})
    .strict();
const OrganizationInvitationListSchema = array(OrganizationInvitationSummarySchema);
const CreateOrganizationInvitationResponseSchema = discriminatedUnion('status', [
    object({
        invitation: OrganizationInvitationSummarySchema,
        status: literal('sent'),
    })
        .strict(),
    object({ status: literal('already_member') }).strict(),
]);
const OrganizationInvitationInspectionSchema = object({
    expiresAt: iso_datetime(),
    inviterDisplayName: schemas_string().trim().min(1).max(120),
    organizationName: schemas_string().trim().min(1).max(120),
    role: InvitationRoleSchema,
    status: schemas_enum(['pending', 'expired', 'revoked', 'accepted']),
})
    .strict();
const InspectOrganizationInvitationRequestSchema = object({ token: ActionTokenSchema })
    .strict();
const AcceptOrganizationInvitationRequestSchema = (/* unused pure expression or super */ null && (InspectOrganizationInvitationRequestSchema));
const AcceptOrganizationInvitationResponseSchema = object({
    organizationId: schemas_string().uuid(),
    status: schemas_enum(['joined', 'already_member']),
})
    .strict();
//# sourceMappingURL=invitations.js.map
;// CONCATENATED MODULE: ../shared/dist/projects.js


const ProviderIdSchema = schemas_string().regex(/^[1-9]\d*$/);
const GitHubInstallationStatusSchema = schemas_enum([
    'active',
    'suspended',
    'removed',
]);
const AccessVerificationSchema = schemas_enum([
    'verified',
    'unavailable',
    'removed',
    'identity_conflict',
    'legacy_unlinked',
    'manual',
]);
const GitHubConnectResponseSchema = object({
    url: schemas_string()
        .url()
        .refine((value) => {
        const url = new URL(value);
        return (url.protocol === 'https:' &&
            url.hostname === 'github.com' &&
            !url.username &&
            !url.password);
    }),
})
    .strict();
const GitHubInstallationSummarySchema = object({
    accessVerification: schemas_enum(['verified', 'unavailable']),
    accountLogin: schemas_string().trim().min(1).max(100),
    accountType: schemas_enum(['Organization', 'User']),
    id: schemas_string().uuid(),
    providerInstallationId: ProviderIdSchema,
    repositorySelection: schemas_enum(['all', 'selected']),
    status: GitHubInstallationStatusSchema,
    updatedAt: schemas_string().datetime(),
})
    .strict();
const GitHubInstallationListSchema = array(GitHubInstallationSummarySchema);
const GitHubRepositorySummarySchema = object({
    defaultBranch: schemas_string().trim().min(1).max(255),
    fullName: schemas_string().regex(/^[^/\s]+\/[^/\s]+$/),
    id: ProviderIdSchema,
    private: schemas_boolean(),
})
    .strict();
const GitHubRepositoryPageSchema = object({
    hasNextPage: schemas_boolean(),
    items: array(GitHubRepositorySummarySchema),
    page: schemas_number().int().positive(),
    perPage: schemas_number().int().min(1).max(100),
})
    .strict();
const AllowedDomainsSchema = array(schemas_string().trim().min(1).max(253))
    .min(1)
    .max(50);
const GitHubProjectRequestSchema = object({
    allowedDomains: AllowedDomainsSchema,
    installationId: schemas_string().uuid(),
    provider: literal('github').optional().default('github'),
    repositoryId: ProviderIdSchema,
})
    .strict();
const GitLabProjectRequestSchema = object({
    allowedDomains: AllowedDomainsSchema,
    defaultBranch: schemas_string().trim().min(1).max(255),
    provider: literal('gitlab'),
    repo: RepositoryPathSchema,
})
    .strict();
const BitbucketRepositoryPathSchema = schemas_string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'repo must use workspace/repository format')
    .refine((value) => value.split('/').every((part) => part !== '.' && part !== '..'), 'repo must use workspace/repository format');
const BitbucketRepositoryUuidSchema = schemas_string()
    .trim()
    .transform((value) => value.replace(/^\{(.*)\}$/, '$1').toLowerCase())
    .pipe(schemas_string().uuid());
const BitbucketProjectRequestSchema = object({
    allowedDomains: AllowedDomainsSchema,
    defaultBranch: schemas_string().trim().min(1).max(255),
    provider: literal('bitbucket'),
    repo: BitbucketRepositoryPathSchema,
    repositoryUuid: BitbucketRepositoryUuidSchema,
})
    .strict();
const CreateProjectRequestSchema = union([
    GitHubProjectRequestSchema,
    GitLabProjectRequestSchema,
    BitbucketProjectRequestSchema,
]);
const ApiKeyMetadataSchema = object({
    createdAt: schemas_string().datetime(),
    id: schemas_string().uuid(),
    name: schemas_string().trim().min(1).max(120),
    prefix: schemas_string().regex(/^qg_live_[0-9a-f]{4}$/),
    revokedAt: schemas_string().datetime().nullable(),
})
    .strict();
const ProjectSummarySchema = object({
    accessVerification: AccessVerificationSchema,
    allowedDomains: array(schemas_string().min(1)).min(1),
    defaultBranch: schemas_string().trim().min(1).max(255),
    id: schemas_string().uuid(),
    installationId: schemas_string().uuid().nullable(),
    keys: array(ApiKeyMetadataSchema),
    provider: CiProviderSchema,
    repo: RepositoryPathSchema,
    repositoryId: ProviderIdSchema.nullable(),
    repositoryUuid: schemas_string().uuid().nullable().default(null),
})
    .strict();
const ProjectListSchema = object({
    bundles: array(BundleIdSchema).optional(),
    limit: object({
        maximum: schemas_number().int().positive().nullable(),
        used: schemas_number().int().nonnegative(),
    })
        .strict(),
    projects: array(ProjectSummarySchema),
})
    .strict();
const CreateApiKeyRequestSchema = object({ name: schemas_string().trim().min(1).max(120) })
    .strict();
const CreateApiKeyResponseSchema = object({
    key: ApiKeyMetadataSchema,
    secret: schemas_string().regex(/^qg_live_[0-9a-f]{4}_[A-Za-z0-9_-]{43}$/),
})
    .strict();
const PROJECT_ERROR_CODES = [
    'GITHUB_INTEGRATION_UNAVAILABLE',
    'GITHUB_PROVIDER_FAILED',
    'GITHUB_CALLBACK_INVALID',
    'RESOURCE_NOT_FOUND',
    'REPOSITORY_ALREADY_CLAIMED',
    'PROJECT_LIMIT_REACHED',
    'TARGET_NOT_PUBLIC',
    'DOMAIN_NOT_ALLOWED',
    'DNS_FAILED',
    'PLAN_INACTIVE',
    'BUNDLE_NOT_ALLOWED',
    'QUOTA_EXCEEDED',
];
const ProjectErrorCodeSchema = schemas_enum(PROJECT_ERROR_CODES);
//# sourceMappingURL=projects.js.map
;// CONCATENATED MODULE: ../shared/dist/run-history.js



const RUN_SCORE_VERSION = 'finding-penalty-v1';
const RunAttemptStatusSchema = schemas_enum([
    'reserved',
    'reported',
    'failed',
    'expired',
]);
const RunScoreVersionSchema = literal(RUN_SCORE_VERSION);
const ProjectRunHistoryItemSchema = object({
    branch: schemas_string().nullable(),
    bundle: BundleIdSchema.nullable(),
    commitSha: schemas_string().nullable(),
    createdAt: schemas_string().datetime(),
    errorKind: schemas_string().nullable(),
    executionMode: ExecutionModeSchema.default('customer_ci'),
    id: schemas_string().uuid(),
    passed: schemas_boolean().nullable(),
    prNumber: schemas_number().int().positive().nullable(),
    score: schemas_number().int().min(0).max(100).nullable(),
    scoreVersion: RunScoreVersionSchema.nullable(),
    status: RunAttemptStatusSchema,
    trigger: RunTriggerSchema.default('ci'),
    url: schemas_string().url(),
})
    .strict()
    .superRefine((item, context) => {
    const hasScore = item.score !== null;
    const hasVersion = item.scoreVersion !== null;
    if (hasScore !== hasVersion) {
        context.addIssue({
            code: 'custom',
            message: 'score and scoreVersion must be provided together',
        });
    }
    if (item.status !== 'reported' && (hasScore || hasVersion)) {
        context.addIssue({
            code: 'custom',
            message: 'non-reported attempts cannot have score metadata',
        });
    }
});
const ProjectRunHistoryIdentitySchema = object({
    defaultBranch: schemas_string(),
    id: schemas_string().uuid(),
    provider: CiProviderSchema,
    repo: RepositoryPathSchema,
})
    .strict();
function datetimeOrderKey(timestamp) {
    // The datetime schemas accept UTC, optional seconds, and arbitrary fractional
    // precision. Normalize equivalent forms without rounding through Date/Number.
    const [whole = '', fraction = ''] = timestamp.slice(0, -1).split('.');
    const seconds = whole.length === 16 ? `${whole}:00` : whole;
    return `${seconds}.${fraction.replace(/0+$/, '')}`;
}
const ProjectRunHistorySchema = object({
    availableBundles: array(BundleIdSchema),
    defaultBundle: BundleIdSchema.nullable(),
    items: array(ProjectRunHistoryItemSchema).max(20),
    nextCursor: schemas_string().nullable(),
    project: ProjectRunHistoryIdentitySchema,
})
    .strict()
    .superRefine((history, context) => {
    for (let index = 1; index < history.items.length; index += 1) {
        const previous = history.items[index - 1];
        const current = history.items[index];
        const previousTime = datetimeOrderKey(previous.createdAt);
        const currentTime = datetimeOrderKey(current.createdAt);
        if (currentTime > previousTime ||
            (currentTime === previousTime &&
                current.id.localeCompare(previous.id) > 0)) {
            context.addIssue({
                code: 'custom',
                path: ['items', index],
                message: 'items must be newest first',
            });
        }
    }
});
const RunScoreTrendPointSchema = object({
    commitSha: schemas_string().nullable(),
    createdAt: schemas_string().datetime(),
    passed: schemas_boolean(),
    runId: schemas_string().uuid(),
    score: schemas_number().int().min(0).max(100),
})
    .strict();
const ProjectRunScoreTrendSchema = object({
    bundle: BundleIdSchema,
    points: array(RunScoreTrendPointSchema).max(30),
    projectId: schemas_string().uuid(),
    scoreVersion: RunScoreVersionSchema,
})
    .strict()
    .superRefine((trend, context) => {
    for (let index = 1; index < trend.points.length; index += 1) {
        const previous = trend.points[index - 1];
        const current = trend.points[index];
        const previousTime = datetimeOrderKey(previous.createdAt);
        const currentTime = datetimeOrderKey(current.createdAt);
        if (currentTime < previousTime ||
            (currentTime === previousTime &&
                current.runId.localeCompare(previous.runId) < 0)) {
            context.addIssue({
                code: 'custom',
                path: ['points', index],
                message: 'points must be chronological',
            });
        }
    }
});
//# sourceMappingURL=run-history.js.map
;// CONCATENATED MODULE: ../shared/dist/project-portfolio.js



const PortfolioLatestRunSchema = object({
    bundle: BundleIdSchema.nullable(),
    createdAt: schemas_string().datetime(),
    id: schemas_string().uuid(),
    passed: schemas_boolean().nullable(),
    score: schemas_number().int().min(0).max(100).nullable(),
    scoreVersion: RunScoreVersionSchema.nullable(),
    status: RunAttemptStatusSchema,
})
    .strict()
    .superRefine((run, context) => {
    if ((run.score === null) !== (run.scoreVersion === null)) {
        context.addIssue({
            code: 'custom',
            message: 'score and scoreVersion must be provided together',
        });
    }
    if (run.status !== 'reported' && run.score !== null) {
        context.addIssue({
            code: 'custom',
            message: 'non-reported attempts cannot have score metadata',
        });
    }
});
const ProjectPortfolioItemSchema = object({
    defaultBranch: schemas_string().min(1),
    id: schemas_string().uuid(),
    latestRun: PortfolioLatestRunSchema.nullable(),
    provider: CiProviderSchema,
    repo: RepositoryPathSchema,
})
    .strict();
const ProjectPortfolioSchema = object({ projects: array(ProjectPortfolioItemSchema) })
    .strict();
//# sourceMappingURL=project-portfolio.js.map
;// CONCATENATED MODULE: ../shared/dist/report-branding.js

const DEFAULT_REPORT_ACCENT_COLOR = '#2457ff';
const AccentColorSchema = schemas_string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i)
    .transform((value) => value.toLowerCase());
const HttpsLogoUrlSchema = schemas_string()
    .trim()
    .url()
    .refine((value) => {
    try {
        const url = new URL(value);
        return (url.protocol === 'https:' &&
            url.username === '' &&
            url.password === '' &&
            url.hash === '');
    }
    catch {
        return false;
    }
}, 'Logo URL must be HTTPS without credentials or a fragment.');
const NullableLogoUrlSchema = preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), HttpsLogoUrlSchema.nullable());
const ReportBrandingSchema = object({
    accentColor: schemas_string().regex(/^#[0-9a-f]{6}$/),
    brandName: schemas_string().trim().min(1).max(120),
    logoUrl: HttpsLogoUrlSchema.nullable(),
})
    .strict();
const UpdateReportBrandingRequestSchema = object({
    accentColor: AccentColorSchema,
    logoUrl: NullableLogoUrlSchema.default(null),
})
    .strict();
//# sourceMappingURL=report-branding.js.map
;// CONCATENATED MODULE: ../shared/dist/report-sharing.js

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TOP_LEVEL = /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;
function normalizeReportHostname(value) {
    const hostname = value.trim().toLowerCase().replace(/\.$/, '');
    if (hostname.length === 0 || hostname.length > 253)
        return undefined;
    const labels = hostname.split('.');
    if (labels.length < 3)
        return undefined;
    const topLevel = labels.at(-1);
    if (!TOP_LEVEL.test(topLevel))
        return undefined;
    return labels.slice(0, -1).every((label) => LABEL.test(label))
        ? hostname
        : undefined;
}
const ReportHostnameSchema = schemas_string()
    .max(253)
    .transform((value, context) => {
    const hostname = normalizeReportHostname(value);
    if (hostname === undefined) {
        context.addIssue({
            code: 'custom',
            message: 'Use a subdomain such as reports.example.com.',
        });
        return NEVER;
    }
    return hostname;
});
const REPORT_DOMAIN_STATUSES = [
    'pending',
    'provisioning',
    'active',
];
const ReportDomainStatusSchema = schemas_enum(REPORT_DOMAIN_STATUSES);
const DnsRecordSchema = object({
    name: schemas_string(),
    type: schemas_enum(['CNAME', 'TXT']),
    value: schemas_string(),
})
    .strict();
const ReportDomainSchema = object({
    checkedAt: schemas_string().nullable(),
    hostname: schemas_string(),
    records: array(DnsRecordSchema),
    status: ReportDomainStatusSchema,
    statusDetail: schemas_string().nullable(),
    verifiedAt: schemas_string().nullable(),
})
    .strict();
const ReportDomainStateSchema = object({
    available: schemas_boolean(),
    domain: ReportDomainSchema.nullable(),
})
    .strict();
const SetReportDomainRequestSchema = object({ hostname: ReportHostnameSchema })
    .strict();
const REPORT_SHARE_LIFETIMES = (/* unused pure expression or super */ null && ([7, 30, 90]));
const CreateReportShareRequestSchema = object({
    expiresInDays: union([literal(7), literal(30), literal(90), schemas_null()])
        .default(30),
})
    .strict();
const ReportShareSchema = object({
    createdAt: schemas_string(),
    createdBy: schemas_string().nullable(),
    expiresAt: schemas_string().nullable(),
    id: schemas_string().uuid(),
    revokedAt: schemas_string().nullable(),
})
    .strict();
const ReportShareListSchema = object({ shares: array(ReportShareSchema) })
    .strict();
const CreatedReportShareSchema = object({ share: ReportShareSchema, url: schemas_string().url() })
    .strict();
//# sourceMappingURL=report-sharing.js.map
;// CONCATENATED MODULE: ../shared/dist/ai-analysis.js

const Text = schemas_string().trim().min(1).max(2000);
const AiFindingSchema = object({
    ruleId: schemas_enum(['alt-text-quality', 'content-intent-fit', 'reading-level']),
    message: Text,
    confidence: schemas_number().min(0).max(1),
    selector: schemas_string().max(300).optional(),
    evidenceId: schemas_string().max(30),
})
    .strict();
const AiSuggestionSchema = object({
    issueFingerprint: schemas_string().regex(/^[a-f0-9]{64}$/),
    checkId: schemas_string().max(100),
    issueIndex: schemas_number().int().nonnegative(),
    explanation: Text,
    fix: Text,
    code: schemas_string().max(3000).nullable(),
})
    .strict();
const AiCoverageSchema = object({
    availableImages: schemas_number().int().nonnegative(),
    sampledImages: schemas_number().int().min(0).max(5),
    textChars: schemas_number().int().min(0).max(30000),
    truncated: schemas_boolean(),
    selectedIssues: schemas_number().int().min(0).max(20),
    omittedIssues: schemas_number().int().nonnegative(),
})
    .strict();
const RunAiAnalysisSchema = object({
    status: schemas_enum(['pending', 'completed', 'unavailable', 'not_applicable']),
    kind: schemas_enum(['page_and_suggestions', 'suggestions']),
    findings: array(AiFindingSchema).max(20),
    suggestions: array(AiSuggestionSchema).max(20),
    coverage: AiCoverageSchema,
    completedAt: schemas_string().datetime().nullable(),
    failureKind: schemas_enum([
        'provider_failed',
        'invalid_response',
        'interrupted',
        'collection_failed',
        'entitlement_changed',
    ])
        .nullable(),
    contentFitDecision: object({ probability: schemas_number().min(0).max(1) })
        .strict()
        .optional(),
})
    .strict();
//# sourceMappingURL=ai-analysis.js.map
;// CONCATENATED MODULE: ../shared/dist/run-detail.js





const ProjectIdentitySchema = object({
    defaultBranch: schemas_string(),
    id: schemas_string().uuid(),
    provider: CiProviderSchema,
    repo: RepositoryPathSchema,
})
    .strict();
const RunDetailSchema = object({
    analysis: RunAiAnalysisSchema.optional(),
    branch: schemas_string().nullable(),
    bundle: BundleIdSchema.nullable(),
    commitSha: schemas_string().nullable(),
    createdAt: schemas_string().datetime(),
    errorKind: schemas_string().nullable(),
    executionMode: ExecutionModeSchema.default('customer_ci'),
    id: schemas_string().uuid(),
    passed: schemas_boolean().nullable(),
    prNumber: schemas_number().int().positive().nullable(),
    results: array(CheckResultSchema).nullable(),
    status: RunAttemptStatusSchema,
    summary: GateVerdictSchema.nullable(),
    trigger: RunTriggerSchema.default('ci'),
    url: schemas_string()
        .url()
        .regex(/^https?:\/\//),
})
    .strict()
    .superRefine((run, context) => {
    if (run.status !== 'reported' && run.results !== null) {
        context.addIssue({
            code: 'custom',
            message: 'only reported attempts can include results',
            path: ['results'],
        });
    }
});
const ProjectRunDetailSchema = object({ project: ProjectIdentitySchema, run: RunDetailSchema })
    .strict();
//# sourceMappingURL=run-detail.js.map
;// CONCATENATED MODULE: ../shared/dist/usage.js

const AccountUsageThresholdSchema = schemas_enum([
    'normal',
    'half',
    'high',
    'exhausted',
]);
const AccountUsageSummarySchema = object({
    organizationId: schemas_string().uuid(),
    period: schemas_string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    resetAt: schemas_string().datetime(),
    used: schemas_number().int().nonnegative(),
    reserved: schemas_number().int().nonnegative(),
    limit: schemas_number().int().nonnegative(),
    remaining: schemas_number().int().nonnegative(),
    percentage: schemas_number().int().min(0).max(100),
    threshold: AccountUsageThresholdSchema,
    scheduled: object({
        limit: schemas_number().int().nonnegative(),
        used: schemas_number().int().nonnegative(),
    })
        .strict()
        .optional(),
})
    .strict()
    .superRefine((value, context) => {
    const [year, month] = value.period.split('-').map(Number);
    const expectedReset = new Date(Date.UTC(year, month, 1)).toISOString();
    const effective = value.used + value.reserved;
    const remaining = Math.max(value.limit - effective, 0);
    const percentage = value.limit === 0
        ? 100
        : Math.min(Math.floor((effective * 100) / value.limit), 100);
    const threshold = percentage >= 100
        ? 'exhausted'
        : percentage >= 80
            ? 'high'
            : percentage >= 50
                ? 'half'
                : 'normal';
    if (value.remaining !== remaining ||
        value.percentage !== percentage ||
        value.threshold !== threshold ||
        value.resetAt !== expectedReset) {
        context.addIssue({
            code: 'custom',
            message: 'usage summary is inconsistent',
        });
    }
});
//# sourceMappingURL=usage.js.map
;// CONCATENATED MODULE: ../shared/dist/notifications.js

const emailRecipient = schemas_email().max(254).nullable();
const slackWebhookUrl = schemas_string()
    .max(500)
    .refine((value) => {
    try {
        const url = new URL(value);
        return (url.origin === 'https://hooks.slack.com' &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash &&
            /^\/services\/[^/]+\/[^/]+\/[^/]+$/.test(url.pathname));
    }
    catch {
        return false;
    }
}, 'Enter a Slack incoming webhook URL.');
const organizationFields = {
    emailRecipient,
    quotaEmail: schemas_boolean(),
    quotaSlack: schemas_boolean(),
    digestEmail: schemas_boolean(),
    digestSlack: schemas_boolean(),
};
const OrganizationNotificationSettingsSchema = object({
    organizationId: schemas_uuid(),
    ...organizationFields,
    slackConfigured: schemas_boolean(),
})
    .strict();
const UpdateOrganizationNotificationSettingsSchema = object({
    ...organizationFields,
    slackWebhookUrl: slackWebhookUrl.nullable().optional(),
})
    .strict();
const ProjectNotificationSettingsSchema = object({
    organizationId: schemas_uuid(),
    projectId: schemas_uuid(),
    failEmail: schemas_boolean(),
    failSlack: schemas_boolean(),
})
    .strict();
const UpdateProjectNotificationSettingsSchema = object({
    failEmail: schemas_boolean(),
    failSlack: schemas_boolean(),
})
    .strict();
//# sourceMappingURL=notifications.js.map
;// CONCATENATED MODULE: ../shared/dist/seo-audit.js

const SEO_AUDIT_STATUSES = [
    'queued',
    'discovering',
    'crawling',
    'analyzing',
    'pause_requested',
    'paused',
    'cancel_requested',
    'completed',
    'cancelled',
    'failed',
    'expired',
];
const SeoAuditStatusSchema = schemas_enum(SEO_AUDIT_STATUSES);
const SEO_AUDIT_ACTIVE_STATUSES = (/* unused pure expression or super */ null && ([
    'queued',
    'discovering',
    'crawling',
    'analyzing',
    'pause_requested',
    'paused',
    'cancel_requested',
]));
const SEO_AUDIT_TERMINAL_STATUSES = (/* unused pure expression or super */ null && ([
    'completed',
    'cancelled',
    'failed',
    'expired',
]));
function isTerminalSeoAuditStatus(status) {
    return SEO_AUDIT_TERMINAL_STATUSES.includes(status);
}
const SeoAuditSeveritySchema = schemas_enum([
    'critical',
    'high',
    'medium',
    'low',
    'informational',
]);
const SEO_AUDIT_SEVERITIES = SeoAuditSeveritySchema.options;
const SeoRuleOutcomeSchema = schemas_enum([
    'pass',
    'fail',
    'not_applicable',
    'unknown',
]);
const SeoCoverageSchema = schemas_enum(['complete', 'limited']);
const SEO_LIMIT_REASONS = [
    'page_budget',
    'discovery_cap',
    'depth_limit',
    'robots_unavailable',
    'sitemap_limit',
    'link_cap',
    'fetch_failures',
    'duration_limit',
    'access_revoked',
    'cancelled',
];
const SeoLimitReasonSchema = schemas_enum(SEO_LIMIT_REASONS);
const SeoAuditCountersSchema = object({
    admitted: schemas_number().int().nonnegative(),
    discovered: schemas_number().int().nonnegative(),
    excluded: schemas_number().int().nonnegative(),
    failed: schemas_number().int().nonnegative(),
    fetched: schemas_number().int().nonnegative(),
    htmlAnalyzed: schemas_number().int().nonnegative(),
    pending: schemas_number().int().nonnegative(),
    robotsBlocked: schemas_number().int().nonnegative(),
    truncated: schemas_number().int().nonnegative(),
})
    .strict();
const SeoAuditProgressSchema = object({
    activeMs: schemas_number().int().nonnegative(),
    auditId: schemas_string().uuid(),
    counters: SeoAuditCountersSchema,
    coverage: SeoCoverageSchema.nullable(),
    createdAt: schemas_string().datetime(),
    errorKind: schemas_string().max(80).nullable(),
    finishedAt: schemas_string().datetime().nullable(),
    heartbeatAt: schemas_string().datetime().nullable(),
    limitReasons: array(SeoLimitReasonSchema),
    pageBudget: schemas_number().int().positive(),
    startedAt: schemas_string().datetime().nullable(),
    stateVersion: schemas_number().int().nonnegative(),
    status: SeoAuditStatusSchema,
    version: schemas_number().int().nonnegative(),
})
    .strict();
const SeoHealthSummarySchema = object({
    evaluatedPages: schemas_number().int().nonnegative(),
    issues: object({
        critical: schemas_number().int().nonnegative(),
        high: schemas_number().int().nonnegative(),
        informational: schemas_number().int().nonnegative(),
        low: schemas_number().int().nonnegative(),
        medium: schemas_number().int().nonnegative(),
    })
        .strict(),
    indexability: object({
        indexable: schemas_number().int().nonnegative(),
        nonIndexable: schemas_number().int().nonnegative(),
        unknown: schemas_number().int().nonnegative(),
    })
        .strict(),
    score: schemas_number().int().min(0).max(100).nullable(),
    scoreVersion: schemas_string(),
    unscoredPages: schemas_number().int().nonnegative(),
    unweightedScore: schemas_number().int().min(0).max(100).nullable(),
})
    .strict();
const SeoAuditSummarySchema = SeoAuditProgressSchema.extend({
    health: SeoHealthSummarySchema.nullable(),
    startUrl: schemas_string().url(),
}).strict();
const SeoAuditListSchema = object({
    items: array(SeoAuditSummarySchema),
    nextCursor: schemas_string().nullable(),
})
    .strict();
const StartSeoAuditRequestSchema = object({ idempotencyKey: schemas_string().uuid() })
    .strict();
const StartSeoAuditResponseSchema = object({
    auditId: schemas_string().uuid(),
    progressUrl: schemas_string(),
    status: literal('queued'),
})
    .strict();
const SeoAuditTransitionRequestSchema = object({ expectedVersion: schemas_number().int().nonnegative() })
    .strict();
//# sourceMappingURL=seo-audit.js.map
;// CONCATENATED MODULE: ../shared/dist/seo-audit-config.js

const SEO_AUDIT_VERSIONS = {
    extractor: 'extract-v1',
    normalization: 'url-v1',
    rules: 'rules-v1',
    score: 'seo-health-v1',
};
const SEO_AUDIT_LIMITS = {
    defaultPages: 1_000,
    maxAdditionalOrigins: 10,
    maxDepth: 100,
    maxDiscoveredUrls: 100_000,
    maxLinksPerPage: 5_000,
    maxPages: 10_000,
    maxPatterns: 20,
    maxSitemapUrls: 10,
};
const PatternSchema = schemas_string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => (value.match(/\*/g)?.length ?? 0) <= 10, {
    message: 'A pattern may contain at most 10 wildcards.',
});
const PatternListSchema = array(PatternSchema)
    .max(SEO_AUDIT_LIMITS.maxPatterns)
    .default([]);
const seo_audit_config_HttpUrlSchema = schemas_string()
    .trim()
    .max(2_048)
    .refine((value) => {
    try {
        const url = new URL(value);
        return ((url.protocol === 'https:' || url.protocol === 'http:') &&
            !url.username &&
            !url.password);
    }
    catch {
        return false;
    }
}, 'Enter a public http or https URL without credentials.');
const OriginSchema = seo_audit_config_HttpUrlSchema.transform((value) => new URL(value).origin);
const SeoDiscoveryModeSchema = schemas_enum([
    'links_and_sitemaps',
    'sitemaps_only',
]);
const SeoGuidanceThresholdsSchema = object({
    descriptionMax: schemas_number().int().min(50).max(400).default(160),
    descriptionMin: schemas_number().int().min(0).max(200).default(50),
    thinContentWords: schemas_number().int().min(0).max(2_000).default(150),
    titleMax: schemas_number().int().min(20).max(200).default(60),
    titleMin: schemas_number().int().min(0).max(60).default(10),
})
    .strict();
const SeoAuditSettingsSchema = object({
    additionalOrigins: array(OriginSchema)
        .max(SEO_AUDIT_LIMITS.maxAdditionalOrigins)
        .default([]),
    discovery: SeoDiscoveryModeSchema.default('links_and_sitemaps'),
    exclude: PatternListSchema,
    excludedParameters: array(schemas_string().trim().min(1).max(100))
        .max(50)
        .default([]),
    expectedNoindex: PatternListSchema,
    hostConcurrency: schemas_number().int().min(1).max(4).default(2),
    important: PatternListSchema,
    include: PatternListSchema,
    maxDepth: schemas_number()
        .int()
        .min(0)
        .max(SEO_AUDIT_LIMITS.maxDepth)
        .default(10),
    maxPages: schemas_number()
        .int()
        .min(1)
        .max(SEO_AUDIT_LIMITS.maxPages)
        .default(SEO_AUDIT_LIMITS.defaultPages),
    primary: PatternListSchema,
    requestsPerSecond: schemas_number().min(0.1).max(2).default(1),
    sitemapUrls: array(seo_audit_config_HttpUrlSchema)
        .max(SEO_AUDIT_LIMITS.maxSitemapUrls)
        .default([]),
    thresholds: SeoGuidanceThresholdsSchema.default(SeoGuidanceThresholdsSchema.parse({})),
})
    .strict();
const SeoAuditConfigSchema = SeoAuditSettingsSchema.extend({
    startUrl: seo_audit_config_HttpUrlSchema,
    versions: object({
        extractor: schemas_string().min(1).max(40),
        normalization: schemas_string().min(1).max(40),
        rules: schemas_string().min(1).max(40),
        score: schemas_string().min(1).max(40),
    })
        .strict(),
}).strict();
const SeoWebsiteSchema = object({
    baseUrl: schemas_string().url(),
    configVersion: schemas_number().int().positive(),
    generation: schemas_number().int().positive(),
    id: schemas_string().uuid(),
    settings: SeoAuditSettingsSchema,
    updatedAt: schemas_string().datetime(),
})
    .strict();
const SeoWebsiteResponseSchema = object({
    allowedDomains: array(schemas_string()),
    limits: object({ maxPages: schemas_number().int().positive() }).strict(),
    website: SeoWebsiteSchema.nullable(),
})
    .strict();
const UpdateSeoWebsiteRequestSchema = object({
    baseUrl: seo_audit_config_HttpUrlSchema,
    expectedVersion: schemas_number().int().nonnegative(),
    settings: SeoAuditSettingsSchema.default(SeoAuditSettingsSchema.parse({})),
})
    .strict();
//# sourceMappingURL=seo-audit-config.js.map
;// CONCATENATED MODULE: ../shared/dist/seo-audit-errors.js

const SEO_AUDIT_ERROR_CODES = [
    'SEO_AUDITS_UNAVAILABLE',
    'SEO_WEBSITE_REQUIRED',
    'SEO_AUDIT_ACTIVE',
    'SEO_BUDGET_EXHAUSTED',
    'SEO_CONFIG_CONFLICT',
    'SEO_TARGET_PROHIBITED',
    'SEO_IDEMPOTENCY_CONFLICT',
    'SEO_TRANSITION_INVALID',
    'SEO_SNAPSHOT_UNAVAILABLE',
];
const SeoAuditErrorCodeSchema = schemas_enum(SEO_AUDIT_ERROR_CODES);
//# sourceMappingURL=seo-audit-errors.js.map
;// CONCATENATED MODULE: ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/coerce.js


function coerce_string(params) {
    return core._coercedString(schemas.ZodString, params);
}
function coerce_number(params) {
    return _coercedNumber(ZodNumber, params);
}
function coerce_boolean(params) {
    return core._coercedBoolean(schemas.ZodBoolean, params);
}
function coerce_bigint(params) {
    return core._coercedBigint(schemas.ZodBigInt, params);
}
function coerce_date(params) {
    return core._coercedDate(schemas.ZodDate, params);
}

;// CONCATENATED MODULE: ../shared/dist/seo-audit-report.js


const SEO_PAGE_SIZE_DEFAULT = 50;
const SEO_PAGE_SIZE_MAX = 100;
const SEO_CRAWL_STATUSES = [
    'discovered',
    'queued',
    'fetched',
    'failed',
    'robots_blocked',
    'excluded',
    'skipped',
];
const SeoCrawlStatusSchema = schemas_enum(SEO_CRAWL_STATUSES);
const SEO_INDEXABILITY = [
    'indexable',
    'noindex',
    'blocked_by_status',
    'canonicalized',
    'unknown',
];
const SeoIndexabilitySchema = schemas_enum(SEO_INDEXABILITY);
const SEO_SOURCE_KINDS = [
    'seed',
    'link',
    'sitemap',
    'redirect',
    'canonical',
    'hreflang',
];
const SeoSourceKindSchema = schemas_enum(SEO_SOURCE_KINDS);
const SEO_ISSUE_CATEGORIES = [
    'requests',
    'indexability',
    'canonicals',
    'metadata',
    'headings',
    'images',
    'content',
    'structured_data',
    'links',
    'internationalization',
    'sitemaps',
];
const SeoIssueCategorySchema = schemas_enum(SEO_ISSUE_CATEGORIES);
const SeoIssueCountsSchema = object({
    critical: schemas_number().int().nonnegative(),
    high: schemas_number().int().nonnegative(),
    informational: schemas_number().int().nonnegative(),
    low: schemas_number().int().nonnegative(),
    medium: schemas_number().int().nonnegative(),
})
    .strict();
const SeoPageSummarySchema = object({
    canonical: schemas_string().nullable(),
    crawlStatus: SeoCrawlStatusSchema,
    depth: schemas_number().int().nonnegative().nullable(),
    fetchedAt: schemas_string().datetime().nullable(),
    httpStatus: schemas_number().int().nullable(),
    incomingLinks: schemas_number().int().nonnegative(),
    indexability: SeoIndexabilitySchema,
    inSitemap: schemas_boolean(),
    issues: SeoIssueCountsSchema,
    pageId: schemas_string().uuid(),
    score: schemas_number().int().min(0).max(100).nullable(),
    skipReason: schemas_string().max(80).nullable(),
    title: schemas_string().nullable(),
    url: schemas_string(),
})
    .strict();
const SeoPageListSchema = object({
    items: array(SeoPageSummarySchema),
    nextCursor: schemas_string().nullable(),
    total: schemas_number().int().nonnegative(),
})
    .strict();
const SEO_PAGE_SORTS = [
    'url',
    'status',
    'score',
    'issues',
    'depth',
    'incoming',
];
const SeoPageSortSchema = schemas_enum(SEO_PAGE_SORTS);
const SeoPageQuerySchema = object({
    crawlStatus: SeoCrawlStatusSchema.optional(),
    cursor: schemas_string().max(500).optional(),
    direction: schemas_enum(['asc', 'desc']).default('asc'),
    indexability: SeoIndexabilitySchema.optional(),
    inSitemap: schemas_enum(['true', 'false']).optional(),
    limit: coerce_number()
        .int()
        .min(1)
        .max(SEO_PAGE_SIZE_MAX)
        .default(SEO_PAGE_SIZE_DEFAULT),
    q: schemas_string().trim().max(200).optional(),
    ruleId: schemas_string().max(80).optional(),
    severity: SeoAuditSeveritySchema.optional(),
    sort: SeoPageSortSchema.default('url'),
    statusFamily: schemas_enum(['2xx', '3xx', '4xx', '5xx', 'none']).optional(),
})
    .strict();
const SeoEvidenceSchema = record(schemas_string().max(60), union([
    schemas_string().max(600),
    schemas_number(),
    schemas_boolean(),
    schemas_null(),
    array(union([schemas_string().max(600), schemas_number()])).max(20),
]));
const SeoIssueOccurrenceSchema = object({
    confidence: schemas_enum(['high', 'medium', 'low']),
    evidence: SeoEvidenceSchema,
    occurrenceId: schemas_string().uuid(),
    pageId: schemas_string().uuid().nullable(),
    ruleId: schemas_string(),
    severity: SeoAuditSeveritySchema,
    url: schemas_string().nullable(),
})
    .strict();
const SeoRuleInfoSchema = object({
    action: schemas_string(),
    category: SeoIssueCategorySchema,
    explanation: schemas_string(),
    id: schemas_string(),
    title: schemas_string(),
    whyItMatters: schemas_string(),
})
    .strict();
const SeoDispositionSchema = schemas_enum(['open', 'acknowledged', 'ignored']);
const SeoIssueGroupSchema = object({
    affectedPages: schemas_number().int().nonnegative(),
    occurrences: schemas_number().int().nonnegative(),
    rule: SeoRuleInfoSchema,
    severity: SeoAuditSeveritySchema,
})
    .strict();
const SeoIssueGroupListSchema = object({ items: array(SeoIssueGroupSchema) })
    .strict();
const SeoIssueGroupDetailSchema = object({
    group: SeoIssueGroupSchema,
    items: array(SeoIssueOccurrenceSchema.extend({
        disposition: SeoDispositionSchema,
        issueId: schemas_string().uuid(),
        recurrence: schemas_enum(['new', 'recurring']),
    }).strict()),
    nextCursor: schemas_string().nullable(),
})
    .strict();
const SeoIssueQuerySchema = object({
    category: SeoIssueCategorySchema.optional(),
    severity: SeoAuditSeveritySchema.optional(),
})
    .strict();
const SeoIssueGroupQuerySchema = object({
    cursor: schemas_string().max(500).optional(),
    disposition: SeoDispositionSchema.optional(),
})
    .strict();
const SeoLinkSummarySchema = object({
    anchor: schemas_string().max(200).nullable(),
    nofollow: schemas_boolean(),
    occurrences: schemas_number().int().positive(),
    pageId: schemas_string().uuid().nullable(),
    status: schemas_number().int().nullable(),
    url: schemas_string(),
})
    .strict();
const SeoPageObservationSchema = object({
    bytes: schemas_number().int().nonnegative().nullable(),
    contentType: schemas_string().nullable(),
    fetchedAt: schemas_string().datetime(),
    headers: record(schemas_string(), schemas_string().max(600)),
    redirectTo: schemas_string().nullable(),
    requestedUrl: schemas_string(),
    status: schemas_number().int().nullable(),
    timingMs: schemas_number().int().nonnegative().nullable(),
    transportError: schemas_string().nullable(),
    truncated: schemas_boolean(),
})
    .strict();
const SeoPageSignalsViewSchema = object({
    canonicals: array(schemas_string()).max(20),
    description: schemas_string().nullable(),
    headings: array(object({ level: schemas_number().int(), text: schemas_string() }).strict())
        .max(50),
    hreflang: array(object({ href: schemas_string(), lang: schemas_string() }).strict())
        .max(50),
    imagesMissingAlt: schemas_number().int().nonnegative(),
    images: schemas_number().int().nonnegative(),
    language: schemas_string().nullable(),
    robots: array(schemas_string()).max(20),
    schemaTypes: array(schemas_string()).max(50),
    title: schemas_string().nullable(),
    wordCount: schemas_number().int().nonnegative(),
})
    .strict();
const SeoPageDetailSchema = object({
    incoming: array(SeoLinkSummarySchema),
    issues: array(SeoIssueOccurrenceSchema.extend({ rule: SeoRuleInfoSchema }).strict()),
    observation: SeoPageObservationSchema.nullable(),
    outgoing: array(SeoLinkSummarySchema),
    outcomes: record(schemas_string(), SeoRuleOutcomeSchema),
    signals: SeoPageSignalsViewSchema.nullable(),
    sources: array(SeoSourceKindSchema),
    summary: SeoPageSummarySchema,
})
    .strict();
const SeoAuditOverviewSchema = object({
    audit: SeoAuditSummarySchema,
    statusFamilies: object({
        '2xx': schemas_number().int().nonnegative(),
        '3xx': schemas_number().int().nonnegative(),
        '4xx': schemas_number().int().nonnegative(),
        '5xx': schemas_number().int().nonnegative(),
        none: schemas_number().int().nonnegative(),
    })
        .strict(),
    topIssues: array(SeoIssueGroupSchema).max(10),
})
    .strict();
const SeoIssueDispositionRequestSchema = object({
    disposition: SeoDispositionSchema,
    expectedVersion: schemas_number().int().nonnegative(),
    reason: schemas_string().trim().max(500).default(''),
})
    .strict();
const SeoIssueEventSchema = object({
    actor: schemas_string().nullable(),
    at: schemas_string().datetime(),
    from: SeoDispositionSchema,
    reason: schemas_string(),
    to: SeoDispositionSchema,
})
    .strict();
const SeoIssueDetailSchema = object({
    disposition: SeoDispositionSchema,
    dispositionAt: schemas_string().datetime().nullable(),
    dispositionReason: schemas_string().nullable(),
    firstSeenAuditId: schemas_string().uuid(),
    history: array(SeoIssueEventSchema).max(50),
    issueId: schemas_string().uuid(),
    lastSeenAuditId: schemas_string().uuid(),
    rule: SeoRuleInfoSchema,
    version: schemas_number().int().nonnegative(),
})
    .strict();
const SEO_EXPORT_SELECTION_MAX = 500;
const SeoExportQuerySchema = SeoPageQuerySchema.pick({
    crawlStatus: true,
    indexability: true,
    inSitemap: true,
    q: true,
    ruleId: true,
    severity: true,
    statusFamily: true,
})
    .extend({
    format: schemas_enum(['csv', 'json']).default('csv'),
    pageIds: schemas_string()
        .max(SEO_EXPORT_SELECTION_MAX * 37)
        .transform((value) => value.split(',').filter(Boolean))
        .pipe(array(schemas_string().uuid()).min(1).max(SEO_EXPORT_SELECTION_MAX))
        .optional(),
})
    .strict();
const SEO_SAVED_FILTER_VERSION = 1;
const SEO_SAVED_FILTER_MAX = 50;
const SeoSavedFilterQuerySchema = SeoPageQuerySchema.pick({
    crawlStatus: true,
    direction: true,
    indexability: true,
    inSitemap: true,
    q: true,
    ruleId: true,
    severity: true,
    sort: true,
    statusFamily: true,
})
    .partial()
    .strict();
const SeoSavedFilterSchema = object({
    createdAt: schemas_string().datetime(),
    id: schemas_string().uuid(),
    name: schemas_string(),
    query: SeoSavedFilterQuerySchema.nullable(),
    stale: schemas_boolean(),
})
    .strict();
const SeoSavedFilterListSchema = object({ items: array(SeoSavedFilterSchema) })
    .strict();
const CreateSeoSavedFilterRequestSchema = object({
    name: schemas_string().trim().min(1).max(80),
    query: SeoSavedFilterQuerySchema,
})
    .strict();
//# sourceMappingURL=seo-audit-report.js.map
;// CONCATENATED MODULE: ../shared/dist/index.js


























//# sourceMappingURL=index.js.map
;// CONCATENATED MODULE: ../reporting/dist/html-report.js

const HTML_REPORT_DEFAULT_THEME = {
    brandName: 'QualityGate',
    accentColor: '#2457ff',
};
const PDF_REPORT_FINDING_LIMIT = 20;
const CHECK_LABELS = {
    a11y: 'Accessibility',
    seo: 'SEO',
    'security-headers': 'Security headers',
    'broken-links': 'Links',
    performance: 'Performance',
    'secrets-exposure': 'Exposed credentials',
    geo: 'AI search readiness',
    'seo-deep': 'Deep SEO',
};
const SEVERITIES = (/* unused pure expression or super */ null && ([
    'critical',
    'serious',
    'moderate',
    'minor',
]));
function escapeText(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
function escapeAttribute(value) {
    return escapeText(value);
}
function html_report_httpUrl(value, name) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new TypeError(`${name} must be an HTTP(S) URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new TypeError(`${name} must be an HTTP(S) URL`);
    }
    return value;
}
function parseTheme(theme) {
    if (theme.brandName.trim().length === 0) {
        throw new TypeError('brandName must not be empty');
    }
    if (!/^#[0-9a-f]{6}$/i.test(theme.accentColor)) {
        throw new TypeError('accentColor must be a six-digit hex color');
    }
    if (theme.logoUrl !== undefined)
        html_report_httpUrl(theme.logoUrl, 'logoUrl');
    return theme;
}
function titleCase(value) {
    return `${value[0].toUpperCase()}${value.slice(1)}`;
}
function checkLabel(checkId) {
    return CHECK_LABELS[checkId] ?? checkId;
}
function orderedResults(bundle, results) {
    const order = new Map(BUNDLE_CHECK_IDS[bundle].map((checkId, index) => [checkId, index]));
    return results
        .map((result, index) => ({ result, index }))
        .sort((left, right) => (order.get(left.result.checkId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.result.checkId) ?? Number.MAX_SAFE_INTEGER) ||
        left.index - right.index)
        .map(({ result }) => result);
}
function pdfSummaryResults(bundle, results) {
    const ordered = orderedResults(bundle, results);
    const selected = new Map();
    let selectedCount = 0;
    for (const severity of SEVERITIES) {
        for (const result of ordered) {
            for (const issue of result.issues) {
                if (issue.severity !== severity ||
                    selectedCount >= PDF_REPORT_FINDING_LIMIT) {
                    continue;
                }
                const issues = selected.get(result) ?? [];
                issues.push(issue);
                selected.set(result, issues);
                selectedCount += 1;
            }
        }
    }
    return ordered.flatMap((result) => {
        const issues = selected.get(result);
        return issues ? [{ ...result, issues }] : [];
    });
}
function metadataItem(label, value) {
    return `<div><dt>${label}</dt><dd>${escapeText(value)}</dd></div>`;
}
function findingHtml(result, analysis) {
    const groups = SEVERITIES.flatMap((severity) => {
        const issues = result.issues.filter((issue) => issue.severity === severity);
        if (issues.length === 0)
            return [];
        const records = issues
            .map((issue) => {
            const issueUrl = html_report_httpUrl(issue.url, 'issue.url');
            const guidance = issue.helpUrl === undefined
                ? ''
                : `<a class="guidance" href="${escapeAttribute(html_report_httpUrl(issue.helpUrl, 'issue.helpUrl'))}" target="_blank" rel="noopener noreferrer">View guidance<span class="visually-hidden"> for ${escapeText(issue.ruleId)}</span></a>`;
            const selector = issue.selector === undefined
                ? ''
                : `<div class="finding-field"><span>Selector</span><code>${escapeText(issue.selector)}</code></div>`;
            const suggestion = analysis?.suggestions.find((item) => item.issueFingerprint === fingerprintIssue(result.checkId, issue));
            const fix = suggestion
                ? `<aside class="ai-fix"><strong>Suggested fix · human review required</strong><p>${escapeText(suggestion.explanation)}</p><p>${escapeText(suggestion.fix)}</p>${suggestion.code ? `<pre><code>${escapeText(suggestion.code)}</code></pre>` : ''}</aside>`
                : '';
            return `<article class="finding finding--${severity}">
<div class="finding-heading"><span class="severity-label">${titleCase(severity)}</span><h4>${escapeText(issue.ruleId)}</h4></div>
<p>${escapeText(issue.message)}</p>
<div class="finding-field"><span>Scanned URL</span><a href="${escapeAttribute(issueUrl)}" target="_blank" rel="noopener noreferrer">${escapeText(issueUrl)}</a></div>
${selector}${guidance}${fix}
</article>`;
        })
            .join('\n');
        return [
            `<section class="severity-group" aria-labelledby="${escapeAttribute(result.checkId)}-${severity}">
<h3 id="${escapeAttribute(result.checkId)}-${severity}">${titleCase(severity)} <span>${issues.length}</span></h3>
${records}
</section>`,
        ];
    });
    return `<section class="check-section" aria-labelledby="check-${escapeAttribute(result.checkId)}">
<h2 id="check-${escapeAttribute(result.checkId)}">${escapeText(checkLabel(result.checkId))}</h2>
${groups.length === 0 ? '<p class="empty-state">No issues recorded</p>' : groups.join('\n')}
</section>`;
}
function aiReviewHtml(analysis, pdf) {
    if (!analysis)
        return '';
    const coverage = analysis.coverage;
    const warning = analysis.status === 'unavailable'
        ? '<p class="ai-warning">AI review unavailable. Automated findings remain available.</p>'
        : coverage.truncated || coverage.omittedIssues > 0
            ? '<p class="ai-warning">Limited coverage: this review uses sampled evidence.</p>'
            : '';
    const entries = analysis.findings
        .slice(0, pdf ? 5 : 20)
        .map((finding) => `<li><strong>${escapeText(finding.ruleId)}</strong><p>${escapeText(finding.message)}</p><p>Confidence: ${Math.round(finding.confidence * 100)}%</p>${finding.selector ? `<code>${escapeText(finding.selector)}</code>` : ''}</li>`)
        .join('');
    return `<section class="check-section" aria-labelledby="ai-review"><h2 id="ai-review">AI review</h2><p>Advisory findings and suggested fixes. Human review required.</p>${warning}${analysis.status === 'pending' ? '<p>Preparing AI suggestions…</p>' : ''}${analysis.status === 'not_applicable' ? '<p>Not enough eligible evidence for an AI review.</p>' : ''}${analysis.status === 'completed' ? `<p>${coverage.sampledImages} of ${coverage.availableImages} images reviewed · ${coverage.textChars} text characters sampled · ${coverage.selectedIssues} issues selected for suggestions</p>${entries ? `<ul>${entries}</ul>` : '<p>No AI concerns recorded in the sampled evidence.</p>'}${pdf && analysis.findings.length > 5 ? '<p>Additional AI findings appear in the complete report.</p>' : ''}` : ''}</section>`;
}
function brandHtml(theme, whiteLabel) {
    const mark = theme.logoUrl === undefined
        ? whiteLabel
            ? ''
            : '<svg class="brand-mark" viewBox="0 0 62 64" aria-hidden="true" focusable="false"><path class="brand-brackets" d="M16 5H4v54h12m26-54h12v54H42M23 54l14-44"/><path class="brand-release" d="m3 52 17-18 13 6 24-27m-10 0h11v11"/></svg>'
        : `<img class="brand-logo" src="${escapeAttribute(theme.logoUrl)}" alt="${escapeAttribute(theme.brandName)} logo">`;
    return `${mark}<span>${escapeText(theme.brandName)}</span>`;
}
function renderHtmlReport(input, theme = HTML_REPORT_DEFAULT_THEME, options = {}) {
    const checkedTheme = parseTheme(theme);
    const runUrl = html_report_httpUrl(input.run.url, 'run.url');
    const decision = input.summary.passed ? 'Gate passed' : 'Gate failed';
    const delta = input.scoreDelta === null
        ? 'No comparison available'
        : `${input.scoreDelta > 0 ? '+' : input.scoreDelta < 0 ? '−' : '±'}${Math.abs(input.scoreDelta)} points`;
    const optionalMetadata = [
        input.run.branch === null ? '' : metadataItem('Branch', input.run.branch),
        input.run.commitSha === null
            ? ''
            : metadataItem('Commit', input.run.commitSha),
        input.run.prNumber === null
            ? ''
            : metadataItem('Pull request', `#${input.run.prNumber}`),
    ].join('');
    const findingCount = input.results.reduce((total, result) => total + result.issues.length, 0);
    const renderedResults = options.profile === 'pdf-summary'
        ? pdfSummaryResults(input.bundle, input.results)
        : orderedResults(input.bundle, input.results);
    const findingsNote = options.profile === 'pdf-summary' && findingCount > PDF_REPORT_FINDING_LIMIT
        ? `<p class="findings-note">Showing the top ${PDF_REPORT_FINDING_LIMIT} of ${findingCount} issues</p>`
        : '';
    const findings = findingCount === 0
        ? '<section class="check-section" aria-labelledby="findings-empty"><h2 id="findings-empty">Findings</h2><p class="empty-state">No issues recorded</p></section>'
        : renderedResults
            .map((result) => findingHtml(result, input.analysis))
            .join('\n');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeText(checkedTheme.brandName)} report — ${escapeText(input.project.repo)}</title>
<style>
:root { --accent: ${checkedTheme.accentColor}; --ink: #10213f; --muted: #5b6880; --paper: #f3f6fb; --surface: #ffffff; --rule: #d8e0ec; --critical: #b42318; --serious: #c2410c; --moderate: #a16207; --minor: #2563eb; color-scheme: light; }
* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
body { margin: 0; }
a { color: #1746c7; overflow-wrap: anywhere; text-underline-offset: .18em; }
a:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; border-radius: 2px; }
code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; overflow-wrap: anywhere; white-space: pre-wrap; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.ai-fix { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--rule); overflow-wrap: anywhere; }
.ai-warning { background: #fff4de; color: #8a4b0f; border: 1px solid #e6c892; border-radius: 8px; padding: 1rem; }
.report-shell { width: min(100% - 2rem, 72rem); margin: 0 auto; padding: 2rem 0 3rem; }
.report-header { border-top: .5rem solid var(--accent); background: var(--surface); padding: clamp(1.25rem, 4vw, 3rem); border-bottom: 1px solid var(--rule); }
.brand { display: flex; align-items: center; gap: .65rem; color: var(--ink); font-family: "Geist Variable", Geist, ui-sans-serif, system-ui, sans-serif; font-weight: 750; letter-spacing: -.02em; font-size: 1.125rem; }
.brand-mark { display: block; width: 2rem; height: auto; flex: none; }
.brand-mark path { fill: none; stroke-linecap: square; stroke-linejoin: miter; }
.brand-brackets { stroke: var(--ink); stroke-width: 2.25; opacity: .34; }
.brand-release { stroke: var(--accent); stroke-width: 5; }
.brand-logo { display: block; max-width: 9rem; max-height: 2.5rem; object-fit: contain; }
h1, h2, h3, h4, p { overflow-wrap: anywhere; }
h1 { margin: 2.5rem 0 0; max-width: 24ch; font-family: "Geist Variable", Geist, ui-sans-serif, system-ui, sans-serif; font-size: clamp(2rem, 7vw, 4.5rem); line-height: .98; letter-spacing: -.04em; }
.target { margin: 1rem 0 0; color: var(--muted); }
.download { margin: 1rem 0 0; }
.download a { color: var(--accent); font-weight: 700; }
.metadata { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: 0; margin: 2rem 0 0; padding: 0; border-top: 1px solid var(--rule); border-left: 1px solid var(--rule); background: transparent; }
.metadata div { min-width: 0; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); background: var(--surface); padding: .85rem 1rem; }
dt, .score-label, .finding-field span, .severity-label { color: var(--muted); font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: .7rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
dd { margin: .25rem 0 0; overflow-wrap: anywhere; }
.report-main { display: grid; gap: 1.25rem; margin-top: 1.25rem; }
.summary, .severity-overview, .check-section { background: var(--surface); border: 1px solid var(--rule); padding: clamp(1.25rem, 4vw, 2.5rem); }
.summary { display: grid; grid-template-columns: minmax(8rem, .65fr) 1fr; gap: clamp(1.5rem, 5vw, 4rem); align-items: end; border-top: .25rem solid var(--accent); }
.score-label { font-size: .75rem; letter-spacing: .1em; }
.score { margin: .15rem 0 0; font: 750 clamp(3.5rem, 12vw, 7rem)/.9 "Geist Variable", Geist, ui-sans-serif, system-ui, sans-serif; letter-spacing: -.04em; }
.score small { font-size: .2em; letter-spacing: 0; color: var(--muted); }
.decision h2 { margin: 0; font-size: clamp(1.5rem, 4vw, 2.5rem); letter-spacing: -.035em; }
.decision p { margin: .65rem 0 0; color: var(--muted); }
.delta { color: var(--ink) !important; font-weight: 700; }
.severity-overview h2, .check-section > h2, .findings-section > h2 { margin: 0 0 1.25rem; font-size: 1.5rem; letter-spacing: -.025em; }
.severity-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin: 0; padding: 1px; background: var(--rule); }
.severity-grid div { background: var(--surface); padding: 1rem; }
.severity-grid dd { font: 750 2rem/1 Inter, ui-sans-serif, system-ui, sans-serif; }
.severity-group + .severity-group { margin-top: 2rem; }
.severity-group h3 { display: flex; justify-content: space-between; gap: 1rem; margin: 0 0 .75rem; padding-bottom: .5rem; border-bottom: 1px solid var(--rule); font-size: 1rem; }
.finding { padding: 1rem 0 1.25rem; border-bottom: 1px solid var(--rule); break-inside: avoid; }
.finding:last-child { border-bottom: 0; }
.finding-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: .6rem; }
.finding h4 { margin: 0; font: 700 1rem/1.35 "SFMono-Regular", Consolas, monospace; }
.finding p { margin: .55rem 0 1rem; }
.severity-label { font-size: .68rem; font-weight: 800; letter-spacing: .06em; }
.finding--critical .severity-label { color: var(--critical); }
.finding--serious .severity-label { color: var(--serious); }
.finding--moderate .severity-label { color: var(--moderate); }
.finding--minor .severity-label { color: var(--minor); }
.finding-field { display: grid; gap: .2rem; margin-top: .65rem; min-width: 0; }
.guidance { display: inline-block; margin-top: 1rem; font-weight: 700; }
.empty-state { margin: 0; padding: 2rem; border: 1px dashed var(--rule); color: var(--muted); text-align: center; }
.findings-section { padding-top: 1.5rem; }
.findings-section > h2 { padding-inline: clamp(1.25rem, 4vw, 2.5rem); }
.findings-note { margin: 0 0 1.25rem; padding-inline: clamp(1.25rem, 4vw, 2.5rem); color: var(--muted); }
.report-footer { display: grid; gap: .4rem; padding: 1.5rem .25rem 0; color: var(--muted); font-size: .78rem; }
.report-footer p { margin: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 38rem) { .report-shell { width: 100%; padding-top: 0; } .summary { grid-template-columns: 1fr; } .severity-grid { grid-template-columns: repeat(2, 1fr); } }
@page { margin: 14mm; }
@media print {
  :root { --paper: #fff; --ink: #000; --muted: #333; --rule: #aaa; }
  html { background: #fff; font-size: 10pt; }
  .report-shell { width: 100%; padding: 0; }
  .report-header, .summary, .severity-overview, .check-section { border-color: #999; }
  .report-header { padding: 0 0 8mm; }
  .report-main { gap: 6mm; }
  .summary, .severity-overview, .check-section { padding: 7mm; }
  .check-section { break-before: auto; }
  .check-section + .check-section { break-before: page; }
  h1, h2, h3, h4 { break-after: avoid; }
  .finding { break-inside: avoid; }
  a[href^="http"]::after { content: " (" attr(href) ")"; font-size: .85em; font-weight: 400; overflow-wrap: anywhere; }
}
</style>
</head>
<body>
<div class="report-shell">
<header class="report-header">
<div class="brand">${brandHtml(checkedTheme, options.whiteLabel === true)}</div>
<h1>${escapeText(input.project.repo)}</h1>
<p class="target">Target: <a href="${escapeAttribute(runUrl)}" target="_blank" rel="noopener noreferrer">${escapeText(runUrl)}</a></p>
${options.pdfHref === undefined ? '' : `<p class="download"><a href="${escapeAttribute(options.pdfHref)}" download>Download PDF</a></p>\n`}<dl class="metadata">
${metadataItem('Run time', input.run.createdAt)}${metadataItem('Default branch', input.project.defaultBranch)}${metadataItem('Bundle', input.bundle)}${optionalMetadata}
</dl>
</header>
<main class="report-main">
<section class="summary" aria-labelledby="decision-heading">
<div><span class="score-label">Quality score</span><p class="score">${input.score}<small>/100</small></p></div>
<div class="decision"><h2 id="decision-heading">${decision}</h2><p class="delta">${delta}</p>${input.summary.failReason === undefined ? '' : `<p>${escapeText(input.summary.failReason)}</p>`}</div>
</section>
<section class="severity-overview" aria-labelledby="severity-heading">
<h2 id="severity-heading">Severity overview</h2>
<dl class="severity-grid">${SEVERITIES.map((severity) => `<div><dt>${titleCase(severity)}</dt><dd>${input.summary.issueCounts[severity]}</dd></div>`).join('')}</dl>
</section>
<section class="findings-section" aria-labelledby="findings-heading"><h2 id="findings-heading">Complete findings</h2>${findingsNote}${findings}</section>
${aiReviewHtml(input.analysis, options.profile === 'pdf-summary')}
</main>
<footer class="report-footer">
<p>Generated by ${escapeText(checkedTheme.brandName)} at <time datetime="${escapeAttribute(input.generatedAt)}">${escapeText(input.generatedAt)}</time></p>
<p>Run ${escapeText(input.run.id)} · Score version ${escapeText(input.scoreVersion)}</p>
</footer>
</div>
</body>
</html>`;
}
//# sourceMappingURL=html-report.js.map
;// CONCATENATED MODULE: ../reporting/dist/scrub.js
const SECRET_QUERY_PARAMETER_NAMES = [
    'access_token',
    'api_key',
    'apikey',
    'auth',
    'authorization',
    'key',
    'sig',
    'signature',
    'token',
];
const secretParameterPattern = new RegExp(`((?:[?&]|\\b)(?:${SECRET_QUERY_PARAMETER_NAMES.join('|')})=)[^&\\s"'<>\\]]+`, 'gi');
const embeddedUrlBoundaryPattern = /["'\s(=]/;
const embeddedUrlTerminatorPattern = /["'\s<>]/;
function redactSecretParameters(value) {
    return value.replace(secretParameterPattern, '$1[REDACTED]');
}
function redactHttpUserinfo(value) {
    const prefix = /^(?:https?:)?\/\//i.exec(value)?.[0];
    if (prefix === undefined)
        return value;
    const authorityStart = prefix.length;
    const authoritySuffix = value.slice(authorityStart);
    const authorityEndOffset = authoritySuffix.search(/[/?#\s]/);
    const authorityEnd = authorityEndOffset === -1
        ? value.length
        : authorityStart + authorityEndOffset;
    const authority = value.slice(authorityStart, authorityEnd);
    const userinfoEnd = authority.lastIndexOf('@');
    if (userinfoEnd === -1)
        return value;
    return `${prefix}${authority.slice(userinfoEnd + 1)}${value.slice(authorityEnd)}`;
}
function scrub_scrubUrl(value) {
    try {
        const protocolRelative = value.startsWith('//');
        const url = new URL(protocolRelative ? `https:${value}` : value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return redactSecretParameters(value);
        }
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return protocolRelative ? `//${url.host}${url.pathname}` : url.toString();
    }
    catch {
        return redactSecretParameters(redactHttpUserinfo(value));
    }
}
function isEscaped(value, index) {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
        slashCount += 1;
    }
    return slashCount % 2 === 1;
}
function startsEmbeddedHttpUrl(value, index) {
    const remainder = value.slice(index).toLowerCase();
    return (remainder.startsWith('https://') ||
        remainder.startsWith('http://') ||
        remainder.startsWith('//'));
}
function startsAbsoluteHttpUrl(value, index) {
    const remainder = value.slice(index).toLowerCase();
    return remainder.startsWith('https://') || remainder.startsWith('http://');
}
function delimiterSearchStart(candidate) {
    const lowerCandidate = candidate.toLowerCase();
    const authorityStart = lowerCandidate.startsWith('https://')
        ? 'https://'.length
        : lowerCandidate.startsWith('http://')
            ? 'http://'.length
            : '//'.length;
    const authorityRemainder = candidate.slice(authorityStart);
    const authorityEndOffset = authorityRemainder.search(/[/?#]/);
    const authorityEnd = authorityEndOffset === -1
        ? candidate.length
        : authorityStart + authorityEndOffset;
    const userinfoEnd = candidate.lastIndexOf('@', authorityEnd);
    const hostStart = userinfoEnd === -1 ? authorityStart : userinfoEnd + 1;
    if (candidate[hostStart] !== '[')
        return hostStart;
    const ipv6End = candidate.indexOf(']', hostStart + 1);
    if (ipv6End === -1)
        return hostStart;
    try {
        new URL(`https://${candidate.slice(hostStart, ipv6End + 1)}`);
        return ipv6End + 1;
    }
    catch {
        return hostStart;
    }
}
function embeddedUrlEnd(selector, start, quote, closingDelimiter) {
    if (quote !== undefined) {
        let inDiscardedSuffix = false;
        for (let cursor = start; cursor < selector.length; cursor += 1) {
            if (cursor > start &&
                !inDiscardedSuffix &&
                startsAbsoluteHttpUrl(selector, cursor))
                return cursor;
            if (selector[cursor] === quote && !isEscaped(selector, cursor))
                return cursor;
            if (/\s/.test(selector[cursor] ?? ''))
                return cursor;
            if (selector[cursor] === '?' || selector[cursor] === '#')
                inDiscardedSuffix = true;
        }
        return selector.length;
    }
    let limit = start;
    while (limit < selector.length &&
        !embeddedUrlTerminatorPattern.test(selector[limit] ?? '')) {
        limit += 1;
    }
    const candidate = selector.slice(start, limit);
    if (closingDelimiter !== undefined) {
        const closingIndex = candidate.indexOf(closingDelimiter, delimiterSearchStart(candidate));
        if (closingIndex >= 0)
            return start + closingIndex;
    }
    while (limit > start && /[\])]/.test(selector[limit - 1] ?? ''))
        limit -= 1;
    return limit;
}
function scrubSelector(selector) {
    let cursor = 0;
    let index = 0;
    let quote;
    let scrubbed = '';
    const delimiterStack = [];
    while (index < selector.length) {
        const character = selector[index];
        if ((character === '"' || character === "'") &&
            !isEscaped(selector, index)) {
            quote =
                quote === character
                    ? undefined
                    : quote === undefined
                        ? character
                        : quote;
            index += 1;
            continue;
        }
        if (quote === undefined) {
            if (character === '[' || character === '(') {
                delimiterStack.push(character === '[' ? ']' : ')');
                index += 1;
                continue;
            }
            if (character === delimiterStack.at(-1)) {
                delimiterStack.pop();
                index += 1;
                continue;
            }
        }
        const previous = index === 0 ? undefined : selector[index - 1];
        const atBoundary = index === 0 ||
            (previous !== undefined && embeddedUrlBoundaryPattern.test(previous));
        const startsAbsolute = startsAbsoluteHttpUrl(selector, index);
        const startsProtocolRelative = !startsAbsolute && startsEmbeddedHttpUrl(selector, index);
        if (!startsAbsolute && (!atBoundary || !startsProtocolRelative)) {
            index += 1;
            continue;
        }
        const end = embeddedUrlEnd(selector, index, quote, quote === undefined ? delimiterStack.at(-1) : undefined);
        scrubbed += selector.slice(cursor, index);
        scrubbed += scrub_scrubUrl(selector.slice(index, end));
        cursor = end;
        index = end;
    }
    scrubbed += selector.slice(cursor);
    return redactSecretParameters(scrubbed);
}
function scrub_scrubIssue(issue) {
    return {
        ...issue,
        url: scrub_scrubUrl(issue.url),
        ...(issue.selector === undefined
            ? {}
            : { selector: scrubSelector(issue.selector) }),
        ...(issue.helpUrl === undefined
            ? {}
            : { helpUrl: scrub_scrubUrl(issue.helpUrl) }),
    };
}
function scrubCheckResult(result) {
    return {
        ...result,
        issues: result.issues.map(scrub_scrubIssue),
    };
}
const embeddedTextUrlPattern = /\bhttps?:\/\/[^\s"'<>`]+/gi;
function scrubText(value) {
    return redactSecretParameters(value.replace(embeddedTextUrlPattern, (url) => scrub_scrubUrl(url)));
}
//# sourceMappingURL=scrub.js.map
;// CONCATENATED MODULE: ../reporting/dist/render.js

const QUALITYGATE_COMMENT_MARKER = '<!-- qualitygate:comment-marker -->';
// Bitbucket Cloud escapes raw HTML, so its marker is an unreferenced link
// definition, which CommonMark renders as nothing.
const QUALITYGATE_BITBUCKET_COMMENT_MARKER = '[//]: # (qualitygate:comment-marker)';
const ACCESSIBILITY_DISCLAIMER = 'Automated accessibility checks are a starting point, not a legal conformance assessment.';
const SEO_DISCLAIMER = 'Automated SEO checks read what this page declares; they do not predict ranking.';
const SECURITY_DISCLAIMER = 'Automated header checks read the response of one page; they are not a penetration test.';
const LINKS_DISCLAIMER = 'Automated link checks request the links on one page once; a host that refuses automated clients is reported as unverified, not broken.';
const PERFORMANCE_DISCLAIMER = 'Lighthouse measures one page under simulated mobile throttling and reports the median of several loads; field data from real visitors can differ.';
const SECRETS_EXPOSURE_DISCLAIMER = 'Credential checks read the scripts and JSON this page loads from its own origin; they cannot see server-side code, and a finding means the credential must be rotated.';
const GEO_DISCLAIMER = 'GEO checks read what this site publishes to AI crawlers and score how quotable its passages are; they do not predict whether an AI engine will cite it.';
const SEO_DEEP_DISCLAIMER = 'Deep SEO crawls a bounded slice of the site from this page; pages beyond the crawl limit are not checked.';
const FULL_DISCLAIMER = 'Automated checks read one page for accessibility, SEO, response headers, and links. They are a starting point, not a legal conformance assessment, a ranking prediction, or a penetration test.';
const DEFAULT_TOP_ISSUE_LIMIT = 3;
const BUNDLE_PRESENTATION = {
    a11y: {
        disclaimer: ACCESSIBILITY_DISCLAIMER,
        label: 'Accessibility',
        noun: 'accessibility',
    },
    ada: {
        disclaimer: ACCESSIBILITY_DISCLAIMER,
        label: 'Accessibility',
        noun: 'accessibility',
    },
    seo: { disclaimer: SEO_DISCLAIMER, label: 'SEO', noun: 'SEO' },
    security: {
        disclaimer: SECURITY_DISCLAIMER,
        label: 'Security headers',
        noun: 'security header',
    },
    links: { disclaimer: LINKS_DISCLAIMER, label: 'Links', noun: 'link' },
    perf: {
        disclaimer: PERFORMANCE_DISCLAIMER,
        label: 'Performance',
        noun: 'performance',
    },
    'secrets-exposure': {
        disclaimer: SECRETS_EXPOSURE_DISCLAIMER,
        label: 'Exposed credentials',
        noun: 'exposed credential',
    },
    geo: {
        disclaimer: GEO_DISCLAIMER,
        label: 'AI search readiness',
        noun: 'AI search readiness',
    },
    'seo-deep': {
        disclaimer: SEO_DEEP_DISCLAIMER,
        label: 'Deep SEO',
        noun: 'SEO',
    },
    full: {
        disclaimer: FULL_DISCLAIMER,
        label: 'Web quality',
        noun: 'web quality',
    },
};
const NEUTRAL_PRESENTATION = {
    disclaimer: 'Automated checks are a starting point; they do not replace review.',
    label: 'Web quality',
    noun: 'automated',
};
function presentationFor(bundleId) {
    return BUNDLE_PRESENTATION[bundleId] ?? NEUTRAL_PRESENTATION;
}
// What each check calls itself in a multi-check breakdown. A bundle that runs
// one check never shows this, so an id with no row here is only reachable from
// a bundle whose checks changed without its presentation, and rendering the raw
// id is more honest than guessing a name for it.
const render_CHECK_LABELS = {
    a11y: 'Accessibility',
    seo: 'SEO',
    'security-headers': 'Security headers',
    'broken-links': 'Links',
    performance: 'Performance',
    'secrets-exposure': 'Exposed credentials',
    geo: 'AI search readiness',
    'seo-deep': 'Deep SEO',
};
// Checks whose engine reports its own 0-100 score (ADR-0008), and how that
// score is named. Only these scores are shown; any other check's score is not
// trusted as a headline number.
const NATURAL_SCORE_LABELS = {
    performance: 'Lighthouse performance score',
    geo: 'Citability score',
};
function naturalScoreLines(results) {
    return results.flatMap(({ checkId, score }) => {
        const label = NATURAL_SCORE_LABELS[checkId];
        if (label === undefined || score === undefined)
            return [];
        return [`${label}: **${Math.round(score)}**/100`, ''];
    });
}
const severityRank = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
};
function assertNonnegativeInteger(value, name) {
    if (!Number.isInteger(value) || value < 0) {
        throw new RangeError(`${name} must be a non-negative integer`);
    }
}
function inlineCode(value) {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    const longestBacktickRun = Math.max(0, ...Array.from(singleLine.matchAll(/`+/g), ([run]) => run.length));
    const fence = '`'.repeat(longestBacktickRun + 1);
    const padding = longestBacktickRun === 0 ? '' : ' ';
    return `${fence}${padding}${singleLine}${padding}${fence}`;
}
function safeRuleId(value) {
    return /^[a-z0-9][a-z0-9._:-]{0,99}$/i.test(value)
        ? value
        : 'unrecognized-rule';
}
// `checkId` is a deliberately open string in the contract (ADR-0004), so it is
// sanitized on the same terms as a rule id before reaching a world-readable
// comment.
function render_checkLabel(checkId) {
    return render_CHECK_LABELS[checkId] ?? safeRuleId(checkId);
}
// Help links are rendered into a world-readable comment, so only documentation
// hosts we ship rules against are linkable. Anything else is dropped rather than
// trusted, because `helpUrl` arrives from the runner.
const TRUSTED_HELP_HOSTS = (/* unused pure expression or super */ null && ([
    ['dequeuniversity.com', '/rules/axe/'],
    ['developers.google.com', '/search/docs/'],
    ['developer.mozilla.org', '/en-US/docs/Web/HTTP/'],
]));
function trustedHelpUrl(value) {
    if (value === undefined)
        return undefined;
    const scrubbed = scrubUrl(value);
    try {
        const url = new URL(scrubbed);
        if (url.protocol !== 'https:')
            return undefined;
        const host = url.hostname.toLowerCase();
        const allowed = TRUSTED_HELP_HOSTS.some(([hostname, prefix]) => host === hostname && url.pathname.startsWith(prefix));
        return allowed ? scrubbed : undefined;
    }
    catch {
        return undefined;
    }
}
function formatIssue({ checkId, issue }, attributed) {
    const safeIssue = scrubIssue(issue);
    const selector = safeIssue.selector === undefined
        ? 'page-level issue'
        : inlineCode(safeIssue.selector);
    const helpUrl = trustedHelpUrl(safeIssue.helpUrl);
    const help = helpUrl === undefined ? '' : ` ([rule help](<${helpUrl}>))`;
    // Which check found it only matters when more than one check ran; on a
    // single-check bundle the label would repeat the bundle line above it.
    const source = attributed ? ` _(${render_checkLabel(checkId)})_` : '';
    return `- **[${safeIssue.severity}] ${safeRuleId(safeIssue.ruleId)}** — ${selector}${source}${help}`;
}
function attributedIssues(results) {
    return results.flatMap(({ checkId, issues }) => issues.map((issue) => ({ checkId, issue })));
}
function topIssues(issues, limit) {
    return issues
        .map((entry, index) => ({ entry, index }))
        .sort((left, right) => severityRank[left.entry.issue.severity] -
        severityRank[right.entry.issue.severity] || left.index - right.index)
        .slice(0, limit)
        .map(({ entry }) => entry);
}
function render_countBySeverity(issues) {
    const counts = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
    };
    for (const issue of issues)
        counts[issue.severity] += 1;
    return counts;
}
/**
 * Per-check counts for a bundle that ran more than one check. The severity
 * table above it answers whether the run passed; this answers which check to
 * open first, which a single flat list of findings cannot.
 */
function checkBreakdown(results) {
    return [
        '| Check | 🔴 | 🟠 | 🟡 | 🔵 |',
        '| --- | ---: | ---: | ---: | ---: |',
        ...results.map((result) => {
            const counts = render_countBySeverity(result.issues);
            return `| ${render_checkLabel(result.checkId)} | ${counts.critical} | ${counts.serious} | ${counts.moderate} | ${counts.minor} |`;
        }),
    ];
}
function usageLine(input) {
    const hasUsage = input.usage !== undefined;
    const hasRemainingRuns = input.remainingRuns !== undefined;
    if (hasUsage === hasRemainingRuns) {
        throw new TypeError('Expected exactly one of usage or remainingRuns');
    }
    if (!hasUsage) {
        assertNonnegativeInteger(input.remainingRuns, 'remainingRuns');
        return `Runs left this month: **${input.remainingRuns.toLocaleString('en-US')}**`;
    }
    const { used, limit } = input.usage;
    if (limit === null) {
        return `**Monthly usage** ${used.toLocaleString('en-US')} runs used · unlimited plan`;
    }
    const filled = Math.round((used / limit) * 10);
    const bar = `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
    return `**Monthly usage** \`${bar}\` ${used.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} runs`;
}
function severityTable(verdict, failOn, diff) {
    const { issueCounts } = verdict;
    // In regression mode the limits apply to what this change introduced, not to
    // what the page carries. Grading the totals against them prints a failing row
    // beside a passing verdict, which reads as a contradiction and teaches the
    // reader to distrust the table.
    const regression = failOn.mode === 'regression';
    const compared = regression && diff?.comparedToBaseline === true;
    const gated = compared ? diff.newIssueCounts : issueCounts;
    const status = (severity, maximum) => {
        // Regression mode with no baseline gated on nothing, so no row passed or
        // failed a limit.
        if (regression && !compared)
            return 'ℹ️';
        return gated[severity] > maximum ? '❌' : '✅';
    };
    const newColumn = (severity) => compared ? ` ${diff.newIssueCounts[severity]} |` : regression ? ' — |' : '';
    const header = regression
        ? '| Severity | Found | New | Limit | Status |\n| --- | ---: | ---: | ---: | :---: |'
        : '| Severity | Found | Limit | Status |\n| --- | ---: | ---: | :---: |';
    return [
        ...header.split('\n'),
        `| 🔴 Critical | **${issueCounts.critical}** |${newColumn('critical')} ${failOn.maxCritical} | ${status('critical', failOn.maxCritical)} |`,
        `| 🟠 Serious | **${issueCounts.serious}** |${newColumn('serious')} ${failOn.maxSerious} | ${status('serious', failOn.maxSerious)} |`,
        `| 🟡 Moderate | **${issueCounts.moderate}** |${newColumn('moderate')} — | ℹ️ |`,
        `| 🔵 Minor | **${issueCounts.minor}** |${newColumn('minor')} — | ℹ️ |`,
    ];
}
/**
 * What changed, before what is merely present. A team carrying old issues cares
 * first about whether this pull request made things worse, and a report that
 * leads with the backlog buries that answer.
 */
function regressionSummary(diff) {
    if (!diff.comparedToBaseline) {
        // Saying "0 new" here would claim a measurement that was never made.
        return [
            '> 📊 No baseline for this page yet, so nothing can be reported as new. This scan becomes the baseline once it runs on the target branch.',
            '',
            `**${diff.counts.existing.toLocaleString('en-US')}** ${diff.counts.existing === 1 ? 'issue' : 'issues'} found.`,
        ];
    }
    const line = [
        `**New in this pull request** ${diff.counts.new.toLocaleString('en-US')}`,
        `**Existing** ${diff.counts.existing.toLocaleString('en-US')}`,
        `**Fixed in this pull request** ${diff.counts.fixed.toLocaleString('en-US')}`,
    ].join(' · ');
    // Fixing something is worth saying out loud, and it never fails a build.
    return diff.counts.fixed > 0
        ? [
            line,
            '',
            `> 🎉 This pull request fixed ${diff.counts.fixed.toLocaleString('en-US')} existing ${diff.counts.fixed === 1 ? 'issue' : 'issues'}.`,
        ]
        : [line];
}
function decisionLine(verdict, presentation, diff) {
    if (verdict.passed) {
        // In a comparison, "passed" means nothing got worse, which is a different
        // claim from "the page is clean" and has to read as one.
        if (diff?.comparedToBaseline === true) {
            return diff.counts.new === 0
                ? '> ✅ No new issues introduced by this pull request.'
                : `> ✅ ${diff.counts.new.toLocaleString('en-US')} new ${diff.counts.new === 1 ? 'issue' : 'issues'} introduced, within the configured limits.`;
        }
        const issueTotal = Object.values(verdict.issueCounts).reduce((total, count) => total + count, 0);
        const finding = issueTotal === 0
            ? `No automated ${presentation.noun} issues found.`
            : `${issueTotal.toLocaleString('en-US')} automated ${presentation.noun} ${issueTotal === 1 ? 'issue' : 'issues'} found.`;
        return `> ✅ ${finding} This gate is within its configured limits.`;
    }
    return `> ❌ ${verdict.failReason ?? 'Configured limits were exceeded.'}`;
}
function renderBody(input, flavor) {
    const limit = input.topIssueLimit ?? DEFAULT_TOP_ISSUE_LIMIT;
    assertNonnegativeInteger(limit, 'topIssueLimit');
    if (input.report.results.length === 0) {
        throw new TypeError('Expected at least one check result to render');
    }
    const presentation = presentationFor(input.report.bundleId);
    const multiCheck = input.report.results.length > 1;
    // Prioritization spans the whole bundle: the reader wants the worst findings
    // of the run, not the worst finding of each check in registration order.
    //
    // Where there is a comparison, the findings this pull request introduced come
    // first regardless of severity. They are the ones its author can act on now,
    // and burying them under a more severe issue that was already there is what
    // makes a report ignorable.
    const selectedIssues = input.diff?.comparedToBaseline === true
        ? [
            ...topIssues(input.diff.newIssues, limit),
            ...topIssues(input.diff.existingIssues, limit),
        ].slice(0, limit)
        : topIssues(attributedIssues(input.report.results), limit);
    const issueLines = selectedIssues.length === 0
        ? ['No prioritized issues to show.']
        : selectedIssues.map((entry) => formatIssue(entry, multiCheck));
    // A single-check bundle would render a one-row table restating the severity
    // table above it, so the breakdown appears only where it adds something.
    const breakdownLines = multiCheck
        ? ['', '### Findings by check', ...checkBreakdown(input.report.results)]
        : [];
    return [
        input.summary.passed
            ? '## ✅ QualityGate passed'
            : '## ❌ QualityGate needs attention',
        '',
        `**${presentation.label}** · \`${input.report.bundleId}\` · [qualitygate.dev](https://qualitygate.dev/)`,
        '',
        decisionLine(input.summary, presentation, input.diff),
        '',
        ...naturalScoreLines(input.report.results),
        ...(input.diff === undefined ? [] : [...regressionSummary(input.diff), '']),
        ...severityTable(input.summary, input.failOn, input.diff),
        ...breakdownLines,
        '',
        usageLine(input),
        '',
        ...(flavor === 'bitbucket'
            ? ['### Scan details and limitations']
            : ['<details>', '<summary>Scan details and limitations</summary>']),
        '',
        `Scanned URL: <${scrubUrl(input.report.url)}>`,
        '',
        '### Prioritized issues',
        ...issueLines,
        '',
        presentation.disclaimer,
        ...(flavor === 'bitbucket' ? [] : ['', '</details>']),
    ].join('\n');
}
function renderPrComment(input, options = {}) {
    const flavor = options.flavor ?? 'github';
    const marker = flavor === 'bitbucket'
        ? QUALITYGATE_BITBUCKET_COMMENT_MARKER
        : QUALITYGATE_COMMENT_MARKER;
    return `${renderBody(input, flavor)}\n${marker}`;
}
function renderJobSummary(input) {
    return renderBody(input, 'github');
}
//# sourceMappingURL=render.js.map
;// CONCATENATED MODULE: ../reporting/dist/index.js



//# sourceMappingURL=index.js.map
;// CONCATENATED MODULE: ./src/output.ts


const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY)/i;
function secretValues(environment) {
    return Object.entries(environment)
        .filter(([name, value]) => SECRET_NAME.test(name) && value && value.length >= 8)
        .map(([, value]) => value)
        .sort((a, b) => b.length - a.length);
}
function redact(text, secrets) {
    let result = text;
    for (const secret of secrets)
        result = result.split(secret).join('[REDACTED]');
    return scrubText(result);
}
function escapeData(value) {
    return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
function escapeProperty(value) {
    return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}
function annotation(level, message, properties = {}) {
    const props = Object.entries(properties)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${escapeProperty(String(value))}`)
        .join(',');
    return `::${level}${props ? ` ${props}` : ''}::${escapeData(message)}`;
}
function heading(title, conclusion) {
    return `## QualityGate / ${title}: ${conclusion}`;
}
function escapeMarkdown(value) {
    return value.replace(/[\\`*_{}[\]<>|#]/g, '\\$&');
}
function codeBlock(text) {
    const fence = text.includes('```') ? '~~~~' : '```';
    return `${fence}text\n${text}\n${fence}`;
}
function createReporter(environment = process.env) {
    return {
        log: (line) => {
            process.stdout.write(`${line}\n`);
        },
        output: (name, value) => {
            if (environment.GITHUB_OUTPUT)
                (0,external_node_fs_namespaceObject.appendFileSync)(environment.GITHUB_OUTPUT, `${name}=${value}\n`, 'utf8');
        },
        summary: (markdown) => {
            if (environment.GITHUB_STEP_SUMMARY)
                (0,external_node_fs_namespaceObject.appendFileSync)(environment.GITHUB_STEP_SUMMARY, `${markdown}\n`, 'utf8');
            else
                process.stdout.write(`${markdown}\n`);
        },
    };
}

;// CONCATENATED MODULE: ./src/plan.ts

const DEFAULT_GITLEAKS_VERSION = '8.28.0';
const LOCKFILES = {
    'bun.lock': 'bun',
    'bun.lockb': 'bun',
    'package-lock.json': 'npm',
    'pnpm-lock.yaml': 'pnpm',
    'yarn.lock': 'yarn',
};
const SCRIPT_CANDIDATES = {
    build: ['build'],
    lint: ['lint'],
    tests: ['test'],
    typecheck: ['typecheck', 'type-check'],
};
const COMMAND_KEYS = {
    build: 'build',
    lint: 'lint',
    tests: 'test',
    typecheck: 'typecheck',
};
const CHECK_KEYS = {
    build: 'build',
    'debug-logs': 'debugLogs',
    lint: 'lint',
    'pr-policy': 'prPolicy',
    secrets: 'secrets',
    tests: 'tests',
    typecheck: 'typecheck',
};
const NPM_PLACEHOLDER_TEST = /no test specified/i;
function readManifest(reader) {
    const source = reader.read('package.json');
    if (source === undefined)
        return undefined;
    try {
        const manifest = JSON.parse(source);
        return manifest !== null && typeof manifest === 'object'
            ? manifest
            : undefined;
    }
    catch {
        return undefined;
    }
}
function detectPackageManager(reader, manifest) {
    if (typeof manifest.packageManager === 'string') {
        const name = manifest.packageManager.split('@')[0];
        if (name === 'bun' || name === 'npm' || name === 'pnpm' || name === 'yarn')
            return name;
    }
    const found = new Set(Object.entries(LOCKFILES)
        .filter(([file]) => reader.exists(file))
        .map(([, manager]) => manager));
    if (found.size > 1)
        return 'ambiguous';
    return [...found][0] ?? 'npm';
}
function installCommand(reader, manager) {
    switch (manager) {
        case 'pnpm':
            return 'pnpm install --frozen-lockfile';
        case 'bun':
            return 'bun install --frozen-lockfile';
        case 'yarn':
            return reader.exists('.yarnrc.yml')
                ? 'yarn install --immutable'
                : 'yarn install --frozen-lockfile';
        case 'npm':
            return reader.exists('package-lock.json') ? 'npm ci' : 'npm install';
    }
}
function discoverScript(scripts, module) {
    const present = SCRIPT_CANDIDATES[module].filter((name) => {
        const body = scripts[name];
        if (typeof body !== 'string' || body.trim() === '')
            return false;
        return !(name === 'test' && NPM_PLACEHOLDER_TEST.test(body));
    });
    if (present.length > 1)
        return { ambiguous: present };
    return present[0] === undefined ? undefined : { script: present[0] };
}
function resolvePlan(config, reader) {
    const manifest = readManifest(reader);
    const scripts = manifest?.scripts !== null && typeof manifest?.scripts === 'object'
        ? manifest.scripts
        : {};
    const manager = manifest ? detectPackageManager(reader, manifest) : undefined;
    const modules = {};
    for (const id of MODULE_IDS) {
        const toggle = config.checks?.[CHECK_KEYS[id]];
        modules[id] =
            toggle === false
                ? { state: 'disabled', reason: 'Disabled in configuration.' }
                : { state: 'enabled' };
    }
    let needsInstall = false;
    for (const id of COMMAND_MODULES) {
        if (modules[id].state === 'disabled')
            continue;
        const explicit = config.checks?.[CHECK_KEYS[id]] === true;
        const configured = config.commands?.[COMMAND_KEYS[id]];
        if (configured !== undefined) {
            modules[id] = { command: configured, state: 'enabled' };
            needsInstall = true;
            continue;
        }
        const discovered = discoverScript(scripts, id);
        let reason;
        if (discovered === undefined) {
            reason = `No commands.${COMMAND_KEYS[id]} is configured and package.json has no matching script.`;
        }
        else if ('ambiguous' in discovered) {
            reason = `package.json defines ${discovered.ambiguous.map((name) => `'${name}'`).join(' and ')}; set commands.${COMMAND_KEYS[id]} to choose one.`;
        }
        else if (manager === 'ambiguous' || manager === undefined) {
            reason = `Several lockfiles are present; set commands.${COMMAND_KEYS[id]} or packageManager in package.json.`;
        }
        else {
            modules[id] = {
                command: `${manager} run ${discovered.script}`,
                state: 'enabled',
            };
            needsInstall = true;
            continue;
        }
        modules[id] = explicit
            ? { reason, state: 'skipped' }
            : { reason, state: 'disabled' };
    }
    let install;
    if (needsInstall) {
        const configuredInstall = config.commands?.install;
        if (typeof configuredInstall === 'string')
            install = configuredInstall;
        else if (configuredInstall === undefined &&
            manifest !== undefined &&
            manager !== undefined &&
            manager !== 'ambiguous')
            install = installCommand(reader, manager);
    }
    return {
        approvals: { minimum: config.approvals?.minimum ?? 0 },
        forbiddenDebug: {
            exclude: config.forbiddenDebug?.exclude ?? DEFAULT_DEBUG_EXCLUDE,
            include: config.forbiddenDebug?.include ?? DEFAULT_DEBUG_INCLUDE,
            patterns: config.forbiddenDebug?.patterns ?? DEFAULT_DEBUG_PATTERNS,
        },
        ...(install === undefined ? {} : { install }),
        mergeReadiness: {
            timeoutMinutes: config.mergeReadiness?.timeoutMinutes ?? 15,
        },
        modules,
        requiredChecks: config.requiredChecks ?? [],
        secrets: {
            baselinePath: config.secrets?.baselinePath ?? '.gitleaks-baseline.json',
            configPath: config.secrets?.configPath ?? '.gitleaks.toml',
            gitleaksVersion: config.secrets?.gitleaksVersion ?? DEFAULT_GITLEAKS_VERSION,
            scope: config.secrets?.scope ?? 'diff',
        },
    };
}

;// CONCATENATED MODULE: ./src/pr-policy.ts
function latestReviewStates(reviews, authorLogin) {
    const states = new Map();
    for (const review of reviews) {
        if (!review.login || review.login === authorLogin)
            continue;
        if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED')
            states.set(review.login, review.state);
        else if (review.state === 'DISMISSED')
            states.delete(review.login);
    }
    return states;
}
function evaluatePolicy(pullRequest, reviews, minimumApprovals) {
    const states = latestReviewStates(reviews, pullRequest.authorLogin);
    const approvals = [...states.values()].filter((state) => state === 'APPROVED').length;
    const changesRequestedBy = [...states.entries()]
        .filter(([, state]) => state === 'CHANGES_REQUESTED')
        .map(([login]) => login)
        .sort();
    const unmet = [];
    const unknown = [];
    if (pullRequest.draft)
        unmet.push('The pull request is a draft.');
    if (pullRequest.mergeable === false)
        unmet.push('The pull request has merge conflicts with its base branch.');
    if (pullRequest.mergeable === null)
        unknown.push('GitHub has not finished computing mergeability.');
    if (changesRequestedBy.length > 0)
        unmet.push(`Changes requested by ${changesRequestedBy.map((login) => `@${login}`).join(', ')}.`);
    if (approvals < minimumApprovals)
        unmet.push(`${approvals} of ${minimumApprovals} required approval${minimumApprovals === 1 ? '' : 's'}.`);
    return { approvals, changesRequestedBy, unmet, unknown };
}

;// CONCATENATED MODULE: ./src/secrets.ts

const PINNED_GITLEAKS_CHECKSUMS = {
    '8.28.0': {
        darwin_arm64: 'd942f3ad147250c9edbaab3fed9e482f98d3b59ba10ae97b8d75647e3ade492c',
        darwin_x64: 'edf5a507008b0d2ef4959575772772770586409c1f6f74dabf19cbe7ec341ced',
        linux_arm64: 'eff65261156100e5d94a6b3dec313d532fddfe19ae1590bf7a2b4f2699128356',
        linux_x64: 'a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb',
    },
};
class SecretScanUnavailable extends Error {
    reason = 'secret-scan-unavailable';
}
function gitleaksAsset(version, platform, arch) {
    const os = platform === 'darwin'
        ? 'darwin'
        : platform === 'linux'
            ? 'linux'
            : undefined;
    const cpu = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : undefined;
    if (!os || !cpu) {
        throw new SecretScanUnavailable(`gitleaks is not available for ${platform}/${arch}.`);
    }
    return {
        archive: `gitleaks_${version}_${os}_${cpu}.tar.gz`,
        target: `${os}_${cpu}`,
    };
}
function releaseUrl(version, file) {
    return `https://github.com/gitleaks/gitleaks/releases/download/v${version}/${file}`;
}
function parseChecksums(text, file) {
    for (const line of text.split('\n')) {
        const [hash, name] = line.trim().split(/\s+/);
        if (name === file && hash && /^[0-9a-f]{64}$/.test(hash))
            return hash;
    }
    return undefined;
}
function sha256(data) {
    return (0,external_node_crypto_namespaceObject.createHash)('sha256').update(data).digest('hex');
}
async function download(fetcher, url) {
    let response;
    try {
        response = await fetcher(url, { signal: AbortSignal.timeout(60_000) });
    }
    catch {
        throw new SecretScanUnavailable('The gitleaks download could not be reached.');
    }
    if (!response.ok) {
        throw new SecretScanUnavailable(`The gitleaks download failed with HTTP ${response.status}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
}
async function downloadVerifiedGitleaks(fetcher, version, platform, arch) {
    const asset = gitleaksAsset(version, platform, arch);
    let expected = PINNED_GITLEAKS_CHECKSUMS[version]?.[asset.target];
    if (expected === undefined) {
        const checksums = new TextDecoder().decode(await download(fetcher, releaseUrl(version, `gitleaks_${version}_checksums.txt`)));
        expected = parseChecksums(checksums, asset.archive);
        if (expected === undefined) {
            throw new SecretScanUnavailable(`No published checksum for ${asset.archive}.`);
        }
    }
    const data = await download(fetcher, releaseUrl(version, asset.archive));
    if (sha256(data) !== expected) {
        throw new SecretScanUnavailable(`Checksum mismatch for ${asset.archive}; the binary was not executed.`);
    }
    return { archive: asset.archive, data };
}
function gitleaksArguments(options) {
    return [
        'git',
        options.source,
        ...(options.scope === 'diff'
            ? [`--log-opts=${options.baseSha}..${options.headSha}`]
            : []),
        '--redact=100',
        '--report-format=json',
        `--report-path=${options.reportPath}`,
        '--exit-code=1',
        '--no-banner',
        '--no-color',
        '--ignore-gitleaks-allow',
        `--config=${options.configPath}`,
        `--gitleaks-ignore-path=${options.ignorePath}`,
        ...(options.baselinePath
            ? [`--baseline-path=${options.baselinePath}`]
            : []),
    ];
}
const secrets_text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
function toFinding(raw) {
    const ruleId = secrets_text(raw.RuleID);
    const path = secrets_text(raw.File);
    if (!ruleId || !path)
        return undefined;
    const date = secrets_text(raw.Date);
    return {
        commit: secrets_text(raw.Commit),
        ...(date ? { date } : {}),
        description: secrets_text(raw.Description),
        fingerprint: secrets_text(raw.Fingerprint),
        line: typeof raw.StartLine === 'number' ? raw.StartLine : 0,
        path,
        ruleId,
    };
}
function interpretScan(exitCode, report) {
    let parsed;
    try {
        parsed = report === undefined ? undefined : JSON.parse(report);
    }
    catch {
        parsed = undefined;
    }
    if (!Array.isArray(parsed))
        return { conclusion: 'error', reason: 'secret-scan-error' };
    const findings = parsed.map((entry) => toFinding(entry));
    if (findings.some((finding) => finding === undefined))
        return { conclusion: 'error', reason: 'secret-scan-error' };
    if (findings.length > 0)
        return { conclusion: 'failed', findings: findings };
    return exitCode === 0
        ? { conclusion: 'passed' }
        : { conclusion: 'error', reason: 'secret-scan-error' };
}
const ROTATION_GUIDES = [
    [
        /^aws/,
        'AWS',
        'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
    ],
    [
        /^github/,
        'GitHub',
        'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation',
    ],
    [
        /^gitlab/,
        'GitLab',
        'https://docs.gitlab.com/user/profile/personal_access_tokens/',
    ],
    [/^stripe/, 'Stripe', 'https://docs.stripe.com/keys'],
    [/^slack/, 'Slack', 'https://api.slack.com/authentication/rotation'],
    [
        /^(gcp|google)/,
        'Google Cloud',
        'https://cloud.google.com/iam/docs/keys-create-delete',
    ],
    [/^npm/, 'npm', 'https://docs.npmjs.com/revoking-access-tokens'],
    [/^openai/, 'OpenAI', 'https://platform.openai.com/api-keys'],
    [/^anthropic/, 'Anthropic', 'https://console.anthropic.com/settings/keys'],
    [/^twilio/, 'Twilio', 'https://www.twilio.com/docs/iam/api-keys'],
    [
        /^sendgrid/,
        'SendGrid',
        'https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys',
    ],
];
function rotationGuide(ruleId) {
    const match = ROTATION_GUIDES.find(([pattern]) => pattern.test(ruleId));
    return match ? { name: match[1], url: match[2] } : undefined;
}

;// CONCATENATED MODULE: ./src/secrets-module.ts






const DEFAULT_GITLEAKS_CONFIG = '[extend]\nuseDefault = true\n';
function cell(value, secrets) {
    return escapeMarkdown(redact(value, secrets)).replace(/\n/g, ' ');
}
function renderFindings(findings, plan, secrets) {
    const shown = findings.slice(0, 100);
    const guides = new Map();
    for (const finding of findings) {
        const guide = rotationGuide(finding.ruleId);
        if (guide)
            guides.set(guide.name, guide.url);
    }
    return [
        heading('secrets', 'failed'),
        '',
        `${findings.length} credential${findings.length === 1 ? ' was' : 's were'} committed on this pull request${plan.secrets.scope === 'full' ? "'s history" : ''}. Matched values are never shown.`,
        '',
        '| Rule | File | Line | Commit | Date | Fingerprint |',
        '| --- | --- | --- | --- | --- | --- |',
        ...shown.map((finding) => `| \`${cell(finding.ruleId, secrets)}\` ${cell(finding.description, secrets)} | \`${cell(finding.path, secrets)}\` | ${finding.line} | \`${cell(finding.commit.slice(0, 12), secrets)}\` | ${cell(finding.date ?? '', secrets)} | \`${cell(finding.fingerprint, secrets)}\` |`),
        ...(findings.length > shown.length
            ? ['', `${findings.length - shown.length} more not shown.`]
            : []),
        '',
        '**Rotate the credential.** Once pushed, the value must be treated as compromised: removing the commit or rewriting history does not undo the exposure.',
        ...[...guides].map(([name, url]) => `- ${name}: ${url}`),
        '',
        `For a confirmed false positive, add its fingerprint to \`.gitleaksignore\` or its entry to the baseline at \`${cell(plan.secrets.baselinePath, secrets)}\` on the base branch. Allowlists are read from the base branch, so this pull request cannot allowlist its own findings.`,
    ].join('\n');
}
const TOKEN = /[A-Za-z0-9_+/=.-]{6,}/g;
function maskTokens(line) {
    return line.replace(TOKEN, (token) => token.length >= 20 || /\d/.test(token) ? '[REDACTED]' : token);
}
function errorLines(output, secrets) {
    return output
        .split('\n')
        .filter((line) => /\b(ERR|FTL|error|fatal)\b/i.test(line))
        .slice(-10)
        .map((line) => maskTokens(redact(line, secrets)).slice(0, 300));
}
function renderError(reason, detail, lines) {
    return [
        heading('secrets', 'failed'),
        '',
        `Reason: \`${reason}\`. ${escapeMarkdown(detail)}`,
        '',
        'An unusable scanner fails the check; it never passes or skips it.',
        ...(lines.length > 0
            ? [
                '',
                '```text',
                ...lines.map((line) => line.replace(/```/g, "'''")),
                '```',
            ]
            : []),
    ].join('\n');
}
async function runSecretsModule(runtime, plan) {
    const { git, reporter } = runtime;
    const secrets = secretValues(runtime.environment);
    const context = readPullRequestContext(runtime.environment);
    const workDirectory = (0,external_node_fs_namespaceObject.mkdtempSync)((0,external_node_path_namespaceObject.join)(runtime.tempDir, 'qualitygate-secrets-'));
    const reportPath = (0,external_node_path_namespaceObject.join)(workDirectory, 'report.json');
    const fail = (reason, detail, lines = []) => {
        reporter.log(annotation('error', `${reason}: ${detail}`, { title: 'Secret scan' }));
        reporter.summary(renderError(reason, detail, lines));
        return 'failed';
    };
    try {
        ensureCommits(git, [context.baseSha, context.headSha]);
        const configPath = (0,external_node_path_namespaceObject.join)(workDirectory, 'gitleaks.toml');
        (0,external_node_fs_namespaceObject.writeFileSync)(configPath, showFile(git, context.baseSha, plan.secrets.configPath) ??
            DEFAULT_GITLEAKS_CONFIG);
        const baseline = showFile(git, context.baseSha, plan.secrets.baselinePath);
        const baselinePath = (0,external_node_path_namespaceObject.join)(workDirectory, 'baseline.json');
        if (baseline !== undefined)
            (0,external_node_fs_namespaceObject.writeFileSync)(baselinePath, baseline);
        const ignoreDirectory = (0,external_node_path_namespaceObject.join)(workDirectory, 'ignore');
        (0,external_node_fs_namespaceObject.mkdirSync)(ignoreDirectory);
        const ignore = showFile(git, context.baseSha, '.gitleaksignore');
        if (ignore !== undefined)
            (0,external_node_fs_namespaceObject.writeFileSync)((0,external_node_path_namespaceObject.join)(ignoreDirectory, '.gitleaksignore'), ignore);
        let binary;
        try {
            const { data } = await downloadVerifiedGitleaks(runtime.fetch, plan.secrets.gitleaksVersion, runtime.platform, runtime.arch);
            const archivePath = (0,external_node_path_namespaceObject.join)(workDirectory, 'gitleaks.tar.gz');
            const binaryDirectory = (0,external_node_path_namespaceObject.join)(workDirectory, 'bin');
            (0,external_node_fs_namespaceObject.mkdirSync)(binaryDirectory);
            (0,external_node_fs_namespaceObject.writeFileSync)(archivePath, data);
            const extracted = await runtime.execFile('tar', [
                '-xzf',
                archivePath,
                '-C',
                binaryDirectory,
                'gitleaks',
            ]);
            binary = (0,external_node_path_namespaceObject.join)(binaryDirectory, 'gitleaks');
            if (extracted.exitCode !== 0 || !(0,external_node_fs_namespaceObject.existsSync)(binary))
                throw new SecretScanUnavailable('The gitleaks archive could not be extracted.');
            (0,external_node_fs_namespaceObject.chmodSync)(binary, 0o755);
        }
        catch (error) {
            if (error instanceof SecretScanUnavailable)
                return fail('secret-scan-unavailable', error.message);
            throw error;
        }
        reporter.log(`Scanning ${plan.secrets.scope === 'diff' ? `${context.baseSha.slice(0, 12)}..${context.headSha.slice(0, 12)}` : 'the full history'} with gitleaks ${plan.secrets.gitleaksVersion}.`);
        const result = await runtime.execFile(binary, gitleaksArguments({
            baseSha: context.baseSha,
            ...(baseline === undefined ? {} : { baselinePath }),
            configPath,
            headSha: context.headSha,
            ignorePath: ignoreDirectory,
            reportPath,
            scope: plan.secrets.scope,
            source: runtime.cwd,
        }));
        const report = (0,external_node_fs_namespaceObject.existsSync)(reportPath)
            ? (0,external_node_fs_namespaceObject.readFileSync)(reportPath, 'utf8')
            : undefined;
        const outcome = interpretScan(result.exitCode, report);
        reporter.log(`gitleaks exited with code ${result.exitCode}.`);
        if (outcome.conclusion === 'error') {
            return fail(outcome.reason, `gitleaks exited with code ${result.exitCode} without a usable report.`, errorLines(result.tail, secrets));
        }
        if (outcome.conclusion === 'passed') {
            reporter.summary(`${heading('secrets', 'passed')}\n\nNo credentials found ${plan.secrets.scope === 'diff' ? 'in the commits of this pull request' : 'in the repository history'}.`);
            return 'passed';
        }
        for (const finding of outcome.findings) {
            reporter.log(annotation('error', `${redact(finding.ruleId, secrets)} committed in ${finding.commit.slice(0, 12)}. Rotate this credential.`, {
                file: redact(finding.path, secrets),
                line: finding.line,
                title: 'Secret committed',
            }));
        }
        reporter.summary(renderFindings(outcome.findings, plan, secrets));
        return 'failed';
    }
    finally {
        (0,external_node_fs_namespaceObject.rmSync)(workDirectory, { force: true, recursive: true });
    }
}

;// CONCATENATED MODULE: ./src/readiness.ts

function moduleItems(plan, needs, moduleIds = MODULE_IDS) {
    const config = needs.config;
    if (!plan || config?.result !== 'success') {
        return [
            {
                detail: config?.result === 'cancelled'
                    ? 'The configuration job was cancelled.'
                    : 'The configuration could not be loaded; no module ran.',
                name: 'config',
                state: 'failed',
            },
        ];
    }
    const items = [];
    for (const id of moduleIds) {
        const module = plan.modules[id];
        if (!module || module.state === 'disabled')
            continue;
        if (module.state === 'skipped') {
            items.push({ detail: module.reason, name: id, state: 'skipped' });
            continue;
        }
        const job = needs[id];
        switch (job?.result) {
            case 'success':
                items.push({ name: id, state: 'passed' });
                break;
            case 'failure':
                items.push({ detail: 'The check failed.', name: id, state: 'failed' });
                break;
            case 'cancelled':
                items.push({
                    detail: 'The check was cancelled.',
                    name: id,
                    state: 'failed',
                });
                break;
            default:
                items.push({
                    detail: 'The check is enabled but did not run.',
                    name: id,
                    state: 'failed',
                });
        }
    }
    return items;
}
const PASSING_CONCLUSIONS = new Set(['neutral', 'skipped', 'success']);
function externalItem(name, check) {
    if (!check)
        return {
            detail: 'Has not reported for this commit.',
            name,
            state: 'pending',
        };
    const url = check.url === undefined ? {} : { url: check.url };
    if (check.status !== 'completed')
        return {
            detail: `Is ${check.status.replace('_', ' ')}.`,
            name,
            state: 'pending',
            ...url,
        };
    if (check.conclusion !== null && PASSING_CONCLUSIONS.has(check.conclusion))
        return { name, state: 'passed', ...url };
    return {
        detail: `Concluded ${(check.conclusion ?? 'without a conclusion').replace('_', ' ')}.`,
        name,
        state: 'failed',
        ...url,
    };
}
function mergeabilityItem(mergeable) {
    if (mergeable === null)
        return {
            detail: 'GitHub has not finished computing mergeability.',
            name: 'mergeability',
            state: 'pending',
        };
    return mergeable
        ? { name: 'mergeability', state: 'passed' }
        : {
            detail: 'The pull request has merge conflicts with its base branch.',
            name: 'mergeability',
            state: 'failed',
        };
}
function aggregate(items) {
    if (items.some((item) => item.state === 'failed'))
        return 'failure';
    if (items.some((item) => item.state === 'pending'))
        return 'pending';
    return 'success';
}
const ELIGIBILITY = {
    failure: 'Eligible for merge: no',
    pending: 'Eligible for merge: pending',
    success: 'Eligible for merge: yes',
};

;// CONCATENATED MODULE: ./src/modules.ts















const MODULE_TITLES = {
    build: 'Build',
    config: 'Configuration',
    'debug-logs': 'Debug logging',
    lint: 'Lint',
    'merge-readiness': 'Merge readiness',
    mergeability: 'Mergeability',
    'pr-policy': 'Pull request policy',
    secrets: 'Secrets',
    tests: 'Tests',
    typecheck: 'Type check',
};
function createRuntime(environment = process.env) {
    const cwd = environment.GITHUB_WORKSPACE?.trim() || process.cwd();
    const token = environment.INPUT_GITHUB_TOKEN?.trim() ||
        environment.GITHUB_TOKEN?.trim() ||
        '';
    return {
        arch: process.arch,
        cwd,
        environment,
        execFile: (file, args) => runProcess(file, args, { cwd }),
        fetch,
        git: createGit(cwd),
        github: (context) => createGitHubClient(context.apiUrl, token, fetch),
        now: () => Date.now(),
        platform: process.platform,
        reporter: createReporter(environment),
        runCommand: (command) => runCommand(command, {
            cwd,
            echo: (chunk) => {
                process.stdout.write(chunk);
            },
        }),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        tempDir: environment.RUNNER_TEMP?.trim() || (0,external_node_os_namespaceObject.tmpdir)(),
    };
}
function workingTreeReader(cwd) {
    return {
        exists: (path) => (0,external_node_fs_namespaceObject.existsSync)((0,external_node_path_namespaceObject.join)(cwd, path)),
        read: (path) => {
            try {
                return (0,external_node_fs_namespaceObject.readFileSync)((0,external_node_path_namespaceObject.join)(cwd, path), 'utf8');
            }
            catch {
                return undefined;
            }
        },
    };
}
function validateConfigPath(path) {
    const normalized = (0,external_node_path_namespaceObject.normalize)(path).replace(/^\.\//, '');
    if ((0,external_node_path_namespaceObject.isAbsolute)(normalized) || normalized.startsWith('..')) {
        throw new ConfigError('quality-config', 'must be a path inside the repository');
    }
    return normalized;
}
function parsePlan(serialized) {
    if (!serialized)
        throw new Error('The quality-check plan input is missing.');
    return JSON.parse(serialized);
}
async function runConfigModule(runtime, inputs) {
    const { reporter } = runtime;
    const context = readPullRequestContext(runtime.environment);
    let plan;
    try {
        const path = validateConfigPath(inputs.configPath);
        let reader;
        if (context.fromFork) {
            ensureCommits(runtime.git, [context.baseSha]);
            reader = refReader(runtime.git, context.baseSha);
            reporter.log('Pull request from a fork: configuration and commands are read from the base branch.');
        }
        else {
            reader = workingTreeReader(runtime.cwd);
        }
        plan = resolvePlan(parseQualityCheckConfig(reader.read(path), path), reader);
    }
    catch (error) {
        if (!(error instanceof ConfigError))
            throw error;
        reporter.log(annotation('error', error.message, {
            title: 'Invalid quality-check configuration',
        }));
        reporter.summary([
            heading('config', 'failed'),
            '',
            `Invalid configuration: \`${error.field}\` ${escapeMarkdown(error.message.slice(error.field.length + 2))}.`,
            '',
            'No repository command was run.',
        ].join('\n'));
        return 'failed';
    }
    reporter.output('plan', JSON.stringify(plan));
    for (const id of MODULE_IDS)
        reporter.output(id, plan.modules[id].state);
    const secrets = secretValues(runtime.environment);
    const rows = MODULE_IDS.map((id) => {
        const module = plan.modules[id];
        const detail = module.command
            ? `\`${redact(module.command, secrets).replace(/`/g, "'")}\``
            : escapeMarkdown(module.reason ?? '');
        return `| ${MODULE_TITLES[id]} | ${module.state} | ${detail} |`;
    });
    reporter.summary([
        heading('config', 'passed'),
        '',
        '| Module | State | Detail |',
        '| --- | --- | --- |',
        ...rows,
        `| ${MODULE_TITLES['merge-readiness']} | enabled | Always published. |`,
    ].join('\n'));
    return 'passed';
}
async function runDebugLogsModule(runtime, inputs) {
    const { git, reporter } = runtime;
    const plan = parsePlan(inputs.plan);
    const context = readPullRequestContext(runtime.environment);
    ensureCommits(git, [context.baseSha, context.headSha]);
    const diff = git([
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--unified=0',
        '--diff-filter=AMR',
        '-M',
        `${context.baseSha}...${context.headSha}`,
    ]);
    const files = selectScannedFiles(parseAddedLines(diff), plan.forbiddenDebug);
    const findings = [];
    for (const file of files) {
        const source = showFile(git, context.headSha, file.path);
        if (source === undefined)
            continue;
        findings.push(...findDebugStatements(file, source, plan.forbiddenDebug.patterns));
    }
    if (findings.length === 0) {
        reporter.summary(`${heading('debug-logs', 'passed')}\n\nNo forbidden debug statements on ${files.length} changed production file${files.length === 1 ? '' : 's'}.`);
        return 'passed';
    }
    for (const finding of findings) {
        reporter.log(annotation('error', `Remove ${finding.pattern} before merging.`, {
            file: finding.path,
            line: finding.line,
            title: 'Debug statement',
        }));
    }
    const shown = findings.slice(0, 100);
    reporter.summary([
        heading('debug-logs', 'failed'),
        '',
        `${findings.length} added line${findings.length === 1 ? '' : 's'} contain${findings.length === 1 ? 's' : ''} a forbidden debug statement.`,
        '',
        '| File | Line | Statement |',
        '| --- | --- | --- |',
        ...shown.map((finding) => `| \`${finding.path.replace(/`/g, "'")}\` | ${finding.line} | \`${finding.pattern}\` |`),
        ...(findings.length > shown.length
            ? ['', `${findings.length - shown.length} more not shown.`]
            : []),
    ].join('\n'));
    return 'failed';
}
async function runCommandModule(runtime, inputs, id) {
    const { reporter } = runtime;
    const plan = parsePlan(inputs.plan);
    const module = plan.modules[id];
    const secrets = secretValues(runtime.environment);
    if (module.state !== 'enabled' || !module.command) {
        reporter.summary(`${heading(id, 'skipped')}\n\n${escapeMarkdown(module.reason ?? 'Not configured.')}`);
        return 'skipped';
    }
    const failure = (step, command, result) => {
        reporter.summary([
            heading(id, 'failed'),
            '',
            `${step} \`${redact(command, secrets).replace(/`/g, "'")}\` exited with code ${result.exitCode}.`,
            '',
            '<details open><summary>Last lines of output</summary>',
            '',
            codeBlock(redact(lastLines(result.tail), secrets)),
            '',
            '</details>',
        ].join('\n'));
        return 'failed';
    };
    if (plan.install) {
        reporter.log(`::group::Install dependencies`);
        const installed = await runtime.runCommand(plan.install);
        reporter.log('::endgroup::');
        if (installed.exitCode !== 0)
            return failure('Dependency installation', plan.install, installed);
    }
    const result = await runtime.runCommand(module.command);
    if (result.exitCode !== 0)
        return failure(MODULE_TITLES[id], module.command, result);
    reporter.summary(`${heading(id, 'passed')}\n\n\`${redact(module.command, secrets).replace(/`/g, "'")}\` exited with code 0.`);
    return 'passed';
}
async function fetchMergeable(github, context) {
    const pull = await github.get(`${repoPath(context.repo)}/pulls/${context.number}`);
    return {
        ...(pull.user?.login ? { authorLogin: pull.user.login } : {}),
        draft: pull.draft === true,
        mergeable: pull.mergeable ?? null,
    };
}
async function runPrPolicyModule(runtime, inputs) {
    const { reporter } = runtime;
    const plan = parsePlan(inputs.plan);
    const context = readPullRequestContext(runtime.environment);
    const github = runtime.github(context);
    let pullRequest = await fetchMergeable(github, context);
    for (let attempt = 0; pullRequest.mergeable === null && attempt < 6; attempt += 1) {
        await runtime.sleep(5_000);
        pullRequest = await fetchMergeable(github, context);
    }
    const reviews = await github.paginate(`${repoPath(context.repo)}/pulls/${context.number}/reviews?per_page=100`);
    const evaluation = evaluatePolicy(pullRequest, reviews.map((review) => ({
        ...(review.user?.login ? { login: review.user.login } : {}),
        state: review.state,
    })), plan.approvals.minimum);
    const blockers = [...evaluation.unmet, ...evaluation.unknown];
    const approvals = `${evaluation.approvals} approval${evaluation.approvals === 1 ? '' : 's'} (minimum ${plan.approvals.minimum}).`;
    if (blockers.length === 0) {
        reporter.summary(`${heading('pr-policy', 'passed')}\n\n${approvals}`);
        return 'passed';
    }
    for (const blocker of blockers)
        reporter.log(annotation('error', blocker, { title: 'Pull request policy' }));
    reporter.summary([
        heading('pr-policy', 'failed'),
        '',
        ...blockers.map((blocker) => `- ${escapeMarkdown(blocker)}`),
        '',
        approvals,
    ].join('\n'));
    return 'failed';
}
async function readExternalChecks(github, context, names) {
    if (names.length === 0)
        return [];
    const base = `${repoPath(context.repo)}/commits/${context.headSha}`;
    let statuses;
    try {
        statuses = await github.paginate(`${base}/statuses?per_page=100`);
    }
    catch {
        statuses = undefined;
    }
    const items = [];
    for (const name of names) {
        try {
            const runs = await github.paginate(`${base}/check-runs?check_name=${encodeURIComponent(name)}&filter=latest&per_page=100`, (page) => page.check_runs);
            const run = runs
                .filter((candidate) => candidate.name === name)
                .sort((a, b) => b.id - a.id)[0];
            let check;
            if (run) {
                check = {
                    conclusion: run.conclusion,
                    status: run.status,
                    ...(run.html_url ? { url: run.html_url } : {}),
                };
            }
            else {
                const status = statuses?.find((candidate) => candidate.context === name);
                if (status)
                    check = {
                        conclusion: status.state === 'pending' ? null : status.state,
                        status: status.state === 'pending' ? 'in_progress' : 'completed',
                        ...(status.target_url ? { url: status.target_url } : {}),
                    };
                else if (statuses === undefined)
                    throw new Error('statuses unavailable');
            }
            items.push(externalItem(name, check));
        }
        catch (error) {
            items.push({
                detail: error instanceof GitHubApiError
                    ? `Could not be read (HTTP ${error.status}).`
                    : 'Could not be read.',
                name,
                state: 'failed',
            });
        }
    }
    return items;
}
function parseNeeds(serialized) {
    if (!serialized)
        return {};
    try {
        const value = JSON.parse(serialized);
        return value !== null && typeof value === 'object'
            ? value
            : {};
    }
    catch {
        return {};
    }
}
const STATE_LABELS = {
    failed: 'failed',
    passed: 'passed',
    pending: 'pending',
    skipped: 'skipped (not required)',
};
function renderReadinessSummary(items, timedOut) {
    const readiness = aggregate(items);
    const rows = items.map((item) => {
        const title = MODULE_TITLES[item.name] ?? escapeMarkdown(item.name);
        const name = item.url ? `[${title}](${item.url})` : title;
        return `| ${name} | ${STATE_LABELS[item.state]} | ${escapeMarkdown(item.detail ?? '')} |`;
    });
    const blocking = items.filter((item) => item.state === 'failed' || item.state === 'pending');
    return [
        heading('merge-readiness', readiness === 'success'
            ? 'passed'
            : readiness === 'failure'
                ? 'failed'
                : 'pending'),
        '',
        `**${ELIGIBILITY[readiness]}**`,
        ...(blocking.length > 0
            ? [
                '',
                `Blocking: ${blocking.map((item) => MODULE_TITLES[item.name] ?? escapeMarkdown(item.name)).join(', ')}.`,
            ]
            : []),
        ...(timedOut
            ? [
                '',
                'Stopped waiting for pending checks. Re-run this job once they finish.',
            ]
            : []),
        '',
        '| Check | Result | Detail |',
        '| --- | --- | --- |',
        ...rows,
        '',
        'QualityGate supplements branch protection; it never merges the pull request.',
    ].join('\n');
}
async function jobLinks(github, context) {
    const links = new Map();
    try {
        const jobs = await github.paginate(`${repoPath(context.repo)}/actions/runs/${context.runId}/attempts/${context.runAttempt}/jobs?per_page=100`, (page) => page.jobs);
        for (const job of jobs) {
            const id = job.name.split(' / ').at(-1)?.trim();
            if (id && job.html_url)
                links.set(id, job.html_url);
        }
    }
    catch {
        links.clear();
    }
    return links;
}
async function runMergeReadinessModule(runtime, inputs) {
    const { reporter } = runtime;
    const context = readPullRequestContext(runtime.environment);
    const needs = parseNeeds(inputs.needs);
    let plan;
    try {
        plan = parsePlan(needs.config?.outputs?.plan);
    }
    catch {
        plan = undefined;
    }
    const github = runtime.github(context);
    const links = await jobLinks(github, context);
    const withLinks = (items) => items.map((item) => {
        const url = links.get(item.name);
        return url && !item.url ? { ...item, url } : item;
    });
    const modules = withLinks(moduleItems(plan, needs));
    const evaluate = async () => {
        if (!plan)
            return modules;
        let mergeability;
        try {
            mergeability = mergeabilityItem((await fetchMergeable(github, context)).mergeable);
        }
        catch (error) {
            mergeability = {
                detail: error instanceof GitHubApiError
                    ? `Could not be read (HTTP ${error.status}).`
                    : 'Could not be read.',
                name: 'mergeability',
                state: 'failed',
            };
        }
        return [
            ...modules,
            mergeability,
            ...(await readExternalChecks(github, context, plan.requiredChecks)),
        ];
    };
    const deadline = runtime.now() + (plan?.mergeReadiness.timeoutMinutes ?? 0) * 60_000;
    let items = await evaluate();
    while (aggregate(items) === 'pending' && runtime.now() < deadline) {
        const waiting = items
            .filter((item) => item.state === 'pending')
            .map((item) => item.name);
        reporter.log(`Waiting for ${waiting.join(', ')}.`);
        await runtime.sleep(15_000);
        items = await evaluate();
    }
    const readiness = aggregate(items);
    reporter.log(ELIGIBILITY[readiness]);
    reporter.summary(renderReadinessSummary(items, readiness === 'pending'));
    if (readiness === 'failure') {
        const blockers = items
            .filter((item) => item.state === 'failed')
            .map((item) => item.name);
        reporter.log(annotation('error', `Blocked by ${blockers.join(', ')}.`, {
            title: ELIGIBILITY.failure,
        }));
    }
    else if (readiness === 'pending') {
        reporter.log(annotation('error', 'Checks were still pending when the wait ended.', {
            title: ELIGIBILITY.pending,
        }));
    }
    return readiness === 'success' ? 'passed' : 'failed';
}
async function runModule(runtime, inputs) {
    switch (inputs.module) {
        case 'config':
            return runConfigModule(runtime, inputs);
        case 'debug-logs':
            return runDebugLogsModule(runtime, inputs);
        case 'lint':
        case 'typecheck':
        case 'tests':
        case 'build':
            return runCommandModule(runtime, inputs, inputs.module);
        case 'secrets':
            return runSecretsModule(runtime, parsePlan(inputs.plan));
        case 'pr-policy':
            return runPrPolicyModule(runtime, inputs);
        case 'merge-readiness':
            return runMergeReadinessModule(runtime, inputs);
        default:
            throw new Error(`Unknown quality-check module '${inputs.module}'.`);
    }
}
function readModuleInputs(environment = process.env) {
    const module = environment.INPUT_MODULE?.trim();
    if (!module)
        throw new Error("Action input 'module' is required.");
    return {
        configPath: environment.INPUT_CONFIG?.trim() || '.qualitygate.yml',
        module,
        ...(environment.INPUT_NEEDS ? { needs: environment.INPUT_NEEDS } : {}),
        ...(environment.INPUT_PLAN ? { plan: environment.INPUT_PLAN } : {}),
    };
}

;// CONCATENATED MODULE: ./src/main.ts

const runtime = createRuntime();
Promise.resolve()
    .then(() => runModule(runtime, readModuleInputs()))
    .then((conclusion) => {
    if (conclusion === 'failed')
        process.exitCode = 1;
})
    .catch((error) => {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`::error title=QualityGate quality check::${message}`);
});

module.exports = __webpack_exports__;
/******/ })()
;