// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE

const func = (CodeMirror) => {
  const Pos = CodeMirror.Pos

  function forEach(arr, f) {
    for (let i = 0, e = arr.length; i < e; ++i) f(arr[i])
  }

  function arrayContains(arr, item) {
    if (!Array.prototype.indexOf) {
      let i = arr.length
      while (i--) {
        if (arr[i] === item) {
          return true
        }
      }
      return false
    }
    return arr.indexOf(item) != -1
  }

  function scriptHint(editor, keywords, getToken, options) {
    // Find the token at the cursor
    const cur = editor.getCursor()

    let token = getToken(editor, cur)
    if (/\b(?:string|comment)\b/.test(token.type)) return
    const innerMode = CodeMirror.innerMode(editor.getMode(), token.state)
    if (innerMode.mode.helperType === 'json') return
    token.state = innerMode.state

    // If it's not a 'word-style' token, ignore the token.
    if (!/^[\w$_]*$/.test(token.string)) {
      token = {
        start: cur.ch,
        end: cur.ch,
        string: '',
        state: token.state,
        type: token.string == '.' ? 'property' : null,
      }
    } else if (token.end > cur.ch) {
      token.end = cur.ch
      token.string = token.string.slice(0, cur.ch - token.start)
    }

    let tprop = token
    // If it is a property, find out what it is a property of.
    while (tprop.type == 'property') {
      tprop = getToken(editor, Pos(cur.line, tprop.start))
      if (tprop.string != '.') return
      tprop = getToken(editor, Pos(cur.line, tprop.start))
      if (!context) var context = []
      context.push(tprop)
    }
    return { list: getCompletions(token, context, keywords, options), from: Pos(cur.line, token.start), to: Pos(cur.line, token.end) }
  }

  function javascriptHint(editor, options) {
    return scriptHint(editor, javascriptKeywords, (e, cur) => e.getTokenAt(cur), options)
  }
  CodeMirror.registerHelper('hint', 'javascript', javascriptHint)

  function getCoffeeScriptToken(editor, cur) {
    // This getToken, it is for coffeescript, imitates the behavior of
    // getTokenAt method in javascript.js, that is, returning "property"
    // type and treat "." as indepenent token.
    const token = editor.getTokenAt(cur)
    if (cur.ch == token.start + 1 && token.string.charAt(0) == '.') {
      token.end = token.start
      token.string = '.'
      token.type = 'property'
    } else if (/^\.[\w$_]*$/.test(token.string)) {
      token.type = 'property'
      token.start++
      token.string = token.string.replace(/\./, '')
    }
    return token
  }

  function coffeescriptHint(editor, options) {
    return scriptHint(editor, coffeescriptKeywords, getCoffeeScriptToken, options)
  }
  CodeMirror.registerHelper('hint', 'coffeescript', coffeescriptHint)

  const stringProps = ('charAt charCodeAt indexOf lastIndexOf substring substr slice trim trimLeft trimRight ' + 'toUpperCase toLowerCase split concat match replace search').split(' ')
  const arrayProps = ('length concat join splice push pop shift unshift slice reverse sort indexOf ' + 'lastIndexOf every some filter forEach map reduce reduceRight ').split(' ')
  const funcProps = 'prototype apply call bind'.split(' ')
  var javascriptKeywords = (
    'break case catch class const continue debugger default delete do else export extends false finally for function '
    + 'if in import instanceof new null return super switch this throw true try typeof var void while with yield'
  ).split(' ')
  var coffeescriptKeywords = (
    'and break catch class continue delete do else extends false finally for ' + 'if in instanceof isnt new no not null of off on or return switch then throw true try typeof until void while with yes'
  ).split(' ')

  function forAllProps(obj, callback) {
    if (!Object.getOwnPropertyNames || !Object.getPrototypeOf) {
      for (const name in obj) callback(name)
    } else {
      for (let o = obj; o; o = Object.getPrototypeOf(o)) Object.getOwnPropertyNames(o).forEach(callback)
    }
  }

  function getCompletions(token, context, keywords, options) {
    // 这里是处理没有任何字母输入时也会有代码提示的原因。
    if (token.string === '') {
      return { list: {} }
    }

    const found = []

    const start = token.string

    const global = (options && options.globalScope) || window
    function maybeAdd(str) {
      if (str.lastIndexOf(start, 0) == 0 && !arrayContains(found, str)) found.push(str)
    }
    function gatherCompletions(obj) {
      if (typeof obj === 'string') forEach(stringProps, maybeAdd)
      else if (obj instanceof Array) forEach(arrayProps, maybeAdd)
      else if (obj instanceof Function) forEach(funcProps, maybeAdd)
      forAllProps(obj, maybeAdd)
    }

    if (context && context.length) {
      // If this is a property, see if it belongs to some object we can
      // find in the current environment.
      const obj = context.pop()

      let base
      if (obj.type && obj.type.indexOf('variable') === 0) {
        if (options && options.additionalContext) base = options.additionalContext[obj.string]
        if (!options || options.useGlobalScope !== false) base = base || global[obj.string]
      } else if (obj.type == 'string') {
        base = ''
      } else if (obj.type == 'atom') {
        base = 1
      } else if (obj.type == 'function') {
        if (global.jQuery != null && (obj.string == '$' || obj.string == 'jQuery') && typeof global.jQuery === 'function') base = global.jQuery()
        else if (global._ != null && obj.string == '_' && typeof global._ === 'function') base = global._()
      }
      while (base != null && context.length) base = base[context.pop().string]
      if (base != null) gatherCompletions(base)
    } else {
      // If not, just look in the global object and any local scope
      // (reading into JS mode internals to get at the local and global variables)
      for (var v = token.state.localVars; v; v = v.next) maybeAdd(v.name)
      for (var v = token.state.globalVars; v; v = v.next) maybeAdd(v.name)
      if (!options || options.useGlobalScope !== false) gatherCompletions(global)
      forEach(keywords, maybeAdd)
    }
    return found
  }
}
