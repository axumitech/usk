import{c as o,r as c,j as e}from"./app-DZr1uBy0.js";import{U as p}from"./user-round-ClZNfoUi.js";/**
 * @license lucide-react v0.475.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"m3 11 18-5v12L3 14v-3z",key:"n962bs"}],["path",{d:"M11.6 16.8a3 3 0 1 1-5.8-1.6",key:"1yl0tm"}]],u=o("Megaphone",d);function h({name:a,photoUrl:s}){const[r,t]=c.useState(null),i=a.trim().split(/\s+/).slice(0,2).map(n=>n.charAt(0)).join("").toUpperCase();return e.jsx("span",{className:"professor-portrait","aria-hidden":"true",children:s&&s!==r?e.jsx("img",{src:s,alt:"",width:80,height:80,onError:()=>t(s)}):i||e.jsx(p,{size:24})})}export{u as M,h as P};
