const decode=value=>value.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
module.exports=function(){
 let document;
  class Element {
    constructor(tag = 'div', attributes = {}) {
      this.tagName = tag.toUpperCase(); this.attributes = attributes; this.children = [];
      this.listeners = {}; this.parentElement = null; this.value = ''; this.checked = false;
      this.hidden = false; this.open = false; this.disabled = false; this._text = '';
      this.dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
    }
    get id() { return this.attributes.id || ''; }
    set id(value) {this.attributes.id=value;}
    get className(){return this.attributes.class||'';}
    set className(value){this.attributes.class=value;}
    get classList(){return {toggle:(name,on)=>{const names=new Set(this.className.split(/\s+/).filter(Boolean));(on??!names.has(name))?names.add(name):names.delete(name);this.className=[...names].join(' ');},contains:name=>this.className.split(/\s+/).includes(name)};}
    cloneNode(deep=false){const copy=new Element(this.tagName==='TEMPLATE'?'FRAGMENT':this.tagName,{...this.attributes});copy._text=this._text;if(deep)this.children.forEach(child=>copy.append(child.cloneNode(true)));return copy;}
    replaceChildren(...children){this.children.forEach(child=>child.parentElement=null);this.children=[];children.forEach(child=>{if(child.tagName==='FRAGMENT')child.children.slice().forEach(item=>this.append(item));else this.append(child);});}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
    getBoundingClientRect(){return {left:0,right:100};}
    scrollIntoView(){}
    get isConnected() { return this === document || Boolean(this.parentElement?.isConnected); }
    append(child) { child.remove(); child.parentElement = this; this.children.push(child); }
    set innerHTML(html) {
      this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = '';
      const stack = [this];
      for (const token of html.matchAll(/<!--[\s\S]*?-->|<\/?[\w-]+\b[^>]*>|[^<]+/g)) {
        const value = token[0];
        if (value.startsWith('<!--')) continue;
        if (value.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
        if (value.startsWith('<')) {
          const tag = value.match(/^<([\w-]+)/)[1];
          const attrs = Object.fromEntries([...value.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, val]) => [key, decode(val)]));
          for (const [, key] of value.matchAll(/\b(data-[\w-]+)(?=\s|\/?>)/g)) attrs[key] ||= '';
          const child = new Element(tag, attrs); stack.at(-1).append(child);
          if (!['img', 'input', 'br', 'hr', 'meta', 'link', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon'].includes(tag) && !value.endsWith('/>')) stack.push(child);
        } else stack.at(-1)._text += decode(value);
      }
    }
    get innerHTML() {return this.children.map(child=>child.outerHTML).join('')+this._text;}
    get outerHTML(){return '<'+this.tagName.toLowerCase()+' '+Object.entries(this.attributes).map(([key,value])=>key+'=\"'+value+'\"').join(' ')+'>'+this.innerHTML+'</'+this.tagName.toLowerCase()+'>';}
    set outerHTML(html){if(!this.parentElement)return;const holder=new Element('div');holder.innerHTML=html;const parent=this.parentElement,index=parent.children.indexOf(this);parent.children.splice(index,1,...holder.children);holder.children.forEach(child=>child.parentElement=parent);this.parentElement=null;}
    get content(){return this;}
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.children.forEach(child => {child.parentElement = null;}); this.children = []; this._text = value; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, props = {}) {
      const event = {target: this, preventDefault() {this.defaultPrevented = true;}, ...props};
      for (let node = this; node; node = node.parentElement) for (const callback of node.listeners[name] || []) callback(event);
      return event;
    }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.includes(' ') && !part.includes('="')) {
          const pieces=part.split(/\s+/),last=pieces.pop();
          if(!this.matches(last))return false;
          for(let node=this.parentElement;node;node=node.parentElement)if(node.matches(pieces.join(' ')))return true;
          return false;
        }
        if (part === ':disabled') return this.disabled;
        if (part === 'dialog:not([open])') return this.tagName === 'DIALOG' && !this.open;
        const tag = part.match(/^[a-z]+/i)?.[0];
        if (tag && this.tagName !== tag.toUpperCase()) return false;
        const id = part.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
        if ([...part.matchAll(/\.([\w-]+)/g)].some(([, name]) => !(this.attributes.class || '').split(/\s+/).includes(name))) return false;
        return [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, key, val]) => Object.hasOwn(this.attributes, key) && (val === undefined || this.attributes[key] === val));
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    removeAttribute(key) { delete this.attributes[key]; }
    getClientRects() { return this.isConnected && !this.hidden ? [{}] : []; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }

 document=new Element('document');document.createElement=tag=>new Element(tag);return {document,Element};
};
