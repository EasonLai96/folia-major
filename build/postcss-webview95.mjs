import postcss from 'postcss';

// Android WebView 95: compose stylesheet transforms without changing desktop CSS.
// Runtime inline transforms still override this composition; this is not a full DOM polyfill.
const prefix = '--folia-compat-';
const parts = ['translate', 'rotate', 'scale', 'transform'];
const composed = parts.map(part => `var(${prefix}${part})`).join(' ');

function transformValue(prop, value) {
    if (value === 'none') return ' ';
    if (prop === 'transform') return value;
    const values = postcss.list.space(value);
    if (prop === 'rotate') {
        if (values.length === 2 && /^[xyz]$/i.test(values[0])) {
            return `rotate${values[0].toUpperCase()}(${values[1]})`;
        }
        return values.length === 4 ? `rotate3d(${values.join(', ')})` : `rotate(${value})`;
    }
    return `${prop}${values.length === 3 ? '3d' : ''}(${values.join(', ')})`;
}

export default function webview95Transforms() {
    return {
        postcssPlugin: 'folia-webview95-transforms',
        Once(root) {
            let changed = false;
            root.walkDecls(/^(transition|transition-property)$/, decl => {
                decl.value = decl.value.replace(/\b(?:translate|rotate|scale)\b/g, 'transform');
            });
            root.walkRules(rule => {
                for (let parent = rule.parent; parent; parent = parent.parent) {
                    if (parent.type === 'atrule' && /(?:^|-)keyframes$/i.test(parent.name)) {
                        rule.walkDecls('transform', decl => {
                            const value = decl.value === 'none' ? '' : decl.value;
                            decl.value = parts.slice(0, 3).map(part => `var(${prefix}${part}, )`).join(' ') + ' ' + value;
                        });
                        return;
                    }
                }
                const declarations = rule.nodes.filter(node => node.type === 'decl' && parts.includes(node.prop));
                if (!declarations.length) return;
                changed = true;
                let important = false;
                for (const decl of declarations) {
                    important ||= Boolean(decl.important);
                    decl.value = transformValue(decl.prop, decl.value);
                    decl.prop = prefix + decl.prop;
                }
                rule.append({ prop: 'transform', value: composed, important });
            });
            if (changed) {
                const defaults = postcss.rule({ selector: '*,::before,::after', source: root.source });
                for (const part of parts) defaults.append({ prop: prefix + part, value: ' ', source: root.source });
                const layer = postcss.atRule({ name: 'layer', params: 'properties', source: root.source });
                layer.append(defaults);
                root.prepend(layer);
            }
        },
    };
}
