import { parseAttributes } from '../parser/attributes'
import { parseInterpolate } from '../parser/interpolate'
import { keyMap, createExpr } from '../parser/index'
import { avalon, config, directives } from '../seed/core'
import { fromString } from '../vtree/fromString'


export function Yield(nodes, render) {
    this.render = render
    var body = this.genChildren(nodes)
    this.body = body
    this.exec = Function('__vmodel__', '$$l', 'var Ʃ = __vmodel__.$render;return ' + body)
}


Yield.prototype = {
    genChildren(nodes) {
        if (nodes.length) {
            var arr = []
            nodes.forEach(function(node) {
                var a = this.genNode(node)
                if (a) {
                    arr.push(a)
                }
            }, this)
            return '[' + arr.join(',\n') + ']'
        } else {
            return '[]'
        }
    },

    genNode(node) {
        if (node.props) {
            return this.genElement(node)
        } else if (node.nodeName === '#comment') {
            return this.genComment(node)
        } else if (node.nodeName === '#text') {
            return this.genText(node)
        }
    },
    genText(node) {
        if (node.dynamic) {
            return `Ʃ.text( ${ createExpr( parseInterpolate(node.nodeValue)) },${true})`
        }
        return `Ʃ.text( ${avalon.quote(node.nodeValue)} )`
    },
    genComment(node) {
        if (node.dynamic) {
            var dir = node.for
            directives['for'].parse.call(dir)
            var keys = `'${dir.valName},${dir.keyName},${dir.asName},${dir.cb}'`
            return `Ʃ.comment('ms-for: ${dir.expr}'),
                    Ʃ.repeat(${ createExpr(dir.expr) }, ${keys}, function($$l){
                return ${this.genChildren(dir.nodes)}
            })`
        }

        return `Ʃ.comment(${avalon.quote(node.nodeValue)})`
    },
    genComponent(node, dirs) {
        for (var i in dirs) {
            if (i !== 'ms-widget')
                delete dirs[i]
        }
        var json = toJSONByArray(
            `nodeName: '${node.nodeName}'`,
            this.genDirs(dirs, node),
            'vm: __vmodel__',
            'slots: slots',
            `props: ${toJSONByObject(node.props)}`,
            `children: []`
        )

        return `(function() {
                var slots = {}
                var slotedElements = ${this.genChildren(node._children)}
                return ${ json }
            })()`

    },
    genElement(node) {
        if (node.nodeName === 'slot') {
            return `Ʃ.slot(${ avalon.quote(node.props.name || "default") })`
        }
        if (node.staticRoot) {
            var index = this.render.staticIndex++
                this.render.staticTree[index] = node
            return `Ʃ.static(${ index })`
        }
        var dirs = node.dirs,
            props = node.props
        if (dirs) {

            var hasCtrl = dirs['ms-controller']
            delete dirs['ms-controller']
            if (dirs['ms-widget']) {
                return this.genComponent(node, dirs)
            }

            if (dirs['ms-text']) {
                var expr = parseInterpolate(config.openTag + dirs['ms-text'] + config.closeTag)
                var code = createExpr(expr, 'text')
                node.template = `[Ʃ.text(${ code })]
            `
                node.children = [{ dynamic: true, nodeName: '#text', nodeValue: NaN }]
                removeDir('text', dirs, props)
                removeDir('html', dirs, props)

            }


            if (dirs['ms-if']) {
                //变成可以传参的东西
                var hasIf = createExpr(dirs['ms-if'])
                removeDir('if', dirs, props)
            }

            if (!Object.keys(dirs).length) {
                dirs = null
            }

        }

        var json = toJSONByArray(
            `nodeName: '${node.nodeName}'`,
            node.vtype ? `vtype: ${ node.vtype }` : '',
            node.staticRoot ? 'staticRoot: true' : '',
            dirs ? this.genDirs(dirs, node) : '',
            dirs ? 'vm: __vmodel__' : '',
            dirs ? 'local: $$l' : '',
            `props: ${ toJSONByObject(node.props) }`,
            `children: ${ node.template || this.genChildren(node.children) }`

        )
        if (node.props.slot) {
            json = `Ʃ.collectSlot(${json},slots)`
        }

        if (hasIf) {
            json = `${ hasIf } ? ${ json } : Ʃ.comment('if')`
        }
        if (hasCtrl) {
            return `Ʃ.ctrl( ${ avalon.quote(hasCtrl) }, __vmodel__, function(__vmodel__) {
                return ${ json }
            }) `
        } else {
            return json
        }
    },

    genDirs(dirs, node) {
        var arr = parseAttributes(dirs, node)
        if (arr.length) {
            node.dirs = arr
            return 'dirs:[' + arr.map(function(dir) {
                if (dir.type === 'duplex') {
                    return this.genDuplex(dir, node)
                }
                return toJSONByArray(
                    `type: ${ avalon.quote(dir.type) }`,
                    `name: ${ avalon.quote(dir.name) }`,
                    dir.param ? `param: ${ avalon.quote(dir.param) }` : '',
                    `value: ${ dir.type === 'on' ? avalon.quote(dir.expr) : createExpr(dir.expr) }`
                )
            }, this) + ']'
        }
        return ''
    },
    genDuplex(dir, node) {
        //抽取里面的change, debounce过滤器为isChanged， debounceTime
        directives.duplex.parse(dir, node)
        return toJSONByArray(
            dir.isChecked ? `isChecked: ${ dir.isChecked }` : '',
            dir.isChange ? `isChange: ${ dir.isChange }` : '',
            dir.debounceTime ? `debounceTime: ${ dir.debounceTime }` : '',
            dir.cb ? `cb: ${ avalon.quote(dir.cb) }` : '',
            dir.parsers ? `parsers: ${ avalon.quote(dir.parsers) }` : '',
            `dtype: ${ avalon.quote(dir.dtype) }`,
            `type: ${ avalon.quote(dir.type) }`,
            `expr: ${ avalon.quote(dir.expr) }`,
            `name: ${ avalon.quote(dir.name) }`,
            `value: ${ createExpr(dir.expr) }`
        )
    }

}

function removeDir(name, dirs, props) {
    delete dirs['ms-' + name]
    delete props['ms-' + name]
    delete props[':' + name]
}

var rneedQuote = /[W\:-]/

function fixKey(k) {
    return (rneedQuote.test(k) || keyMap[k]) ? avalon.quote(k) : k
}


function toJSONByArray() {
    return '{' + avalon.slice(arguments, 0).filter(function(el) {
        return el
    }).join(',') + '}'
}

function toJSONByObject(obj) {
    var arr = []
    for (var i in obj) {
        if (obj[i] === undefined || obj[i] === '')
            continue
        arr.push(`${ fixKey(i) }: ${ avalon.quote(obj[i]) }`)
    }
    return '{' + arr + '}'
}