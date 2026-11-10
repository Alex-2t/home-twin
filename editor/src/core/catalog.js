// Furniture catalog: data only. Generators and models live in furniture3d.js.
// gen: generated in code, any size within min/max; kenney: a ready-made CC0 model with a fixed size.
// lift: hangs on a wall with its bottom at this height above the floor (wall cabinets, TV, range hood); an item can change it (f.z); dashed on the plan.
// vars: variants of one item ([key, label], the first is the default; the item stores f.v); mirror: comes in left and right versions (f.mx).
// tags: other search words; \u00ad in a name marks where to hyphenate a long word on the card. Kitchen modules are 60 cm wide with the plinth and countertop of “Base cabinets”: placed in a row they read as one kitchen.
// colors: which colors the item comes in (the first in the list need not be the default, that one is in color); none means wood and white/graphite.
// Besides these swatches an item can have any custom #rrggbb (color.js). color2: the item takes a second color from the same swatches
// (a rug's border, f.color2); not set — a darker shade of the main one.
// foot: L-shaped on the plan (corner cabinet, corner sofa): an arm along the back of depth back and along the left side (mirrored: the right) of width side;
// u: U-shaped (both side arms). run: along walls (built-in wardrobe, kitchen cabinets): stretches along the walls and around corners, its shape comes from the walls (runs.js);
// also: which other catalog sections to show it in. round: a circle on the plan (true or a list of variants: ['round','oval']).
// table: a table with space under it; under: slides under a table: true means entirely (mobile pedestal), a number is up to which height
// it goes under the tabletop (a chair seat, armchair armrests; the backrest stays outside).
// vars: the third element is a number (how much deeper it extends forward: an unfolded sofa bed) or {w,d,h}, the dimensions of this variant.
// free: stands on its own, away from the walls (a car): tall, yet in 3D it does not hide with its back to the camera like a wardrobe by a facade.
// At a window any item centers on it; fit: when placed, takes the window width + fit m (curtains); soft: conflicts with nothing (curtains hang in front of furniture).
import {t,N} from '../i18n/i18n.js';
import {isHex,hexNum} from './color.js';
export const COLORS={oak:[N('Oak'),0xc8a477],walnut:[N('Walnut'),0x7b5a3c],white:[N('White'),0xeeebe6],graphite:[N('Graphite'),0x57595e],
  beige:[N('Beige'),0xd8ccb6],sage:[N('Sage'),0x98a38f],navy:[N('Navy'),0x3e4b60],
  linen:[N('Linen'),0xd9d1c3],sand:[N('Sand'),0xc1a785],grey:[N('Gray'),0x8d9095],olive:[N('Olive'),0x737c5c],terracotta:[N('Terracotta'),0xa8644b],
  steel:[N('Steel'),0xb7bbbf],black:[N('Black'),0x27282b],chrome:[N('Chrome'),0xc9cdd1]};
// Kitchen worktops (item.top, an entry with tops: true): [name, color, roughness]; none set — gray stone. One worktop for the whole kitchen:
// choosing it on one unit sets it on every unit with a worktop in the room (modes/furniture.js).
export const TOPS={stone:[N('Gray stone'),0x7a7d82,.32],white:[N('White quartz'),0xe9e6df,.24],oak:[N('Oak'),0xc29a6b,.5],walnut:[N('Walnut'),0x74533a,.5],black:[N('Black stone'),0x2b2c2f,.28]};
// Automotive finishes use the existing saved color keys, with their own swatches and lacquer tones.
export const CAR_COLORS={navy:[N('Sapphire blue'),0x155fce],sage:[N('Emerald green'),0x087b5b],terracotta:[N('Ruby red'),0xb8183d],
  white:[N('Pearl white'),0xf2f5fa],grey:[N('Silver metallic'),0xb8c7d9],graphite:[N('Graphite metallic'),0x465363],black:[N('Obsidian black'),0x171f2b]};
export const colorOf=(c,key)=>(c.id==='car'?CAR_COLORS[key]:null)||COLORS[key];
// A color as a number for 3D: a named key or a custom #rrggbb; anything else — fallback.
export const hexOf=(k,fallback=COLORS.white[1])=>isHex(k)?hexNum(k):COLORS[k]?.[1]??fallback;
const WOOD=['oak','walnut','white','graphite'],FACADE=[...WOOD,'beige','sage','navy'],FABRIC=['linen','sand','grey','graphite','olive','sage','navy','terracotta'],APPL=['white','steel','black'];
const SANITARY=['white','beige','grey','graphite','black'],SCREEN=['black','white','steel'];
export const colorsOf=c=>c.colors||WOOD;
export const CATALOG=[
  // A custom item is anything not in the catalog (boxing, column, exercise machine, safe): a block or a cylinder, its own name (f.name), any size and color.
  {id:'custom',cat:'',name:N('Custom item'),kind:'gen',w:.6,d:.4,h:.8,lift:0,color:'white',colors:['white','beige','oak','walnut','grey','graphite','black','sage','navy','terracotta','steel'],vars:[['box',N('Box')],['cyl',N('Cylinder')]],tags:N('custom item object box block column pillar shape'),min:[.03,.02,.01],max:[6,6,2.7]},
  {id:'dresser',cat:N('Storage'),name:N('Dresser'),kind:'gen',w:1.2,d:0.45,h:0.85,color:'oak',min:[0.78,0.34,0.68],max:[1.92,0.63,1.06]},
  {id:'tvStand',cat:N('Living room'),name:N('TV bench'),kind:'gen',w:1.6,d:0.4,h:0.5,lift:0,color:'oak',tags:N('tv stand bench media console wall-mounted'),min:[1.04,0.3,0.4],max:[2.56,0.56,0.62]},
  {id:'bench',cat:N('Hallway'),name:N('Bench'),kind:'gen',w:1.1,d:0.4,h:0.45,color:'oak',colors:[...WOOD,'black','beige',...FABRIC],vars:[['wood',N('Wooden')],['upholstered',N('Upholstered')]],min:[0.72,0.3,0.36],max:[1.76,0.56,0.56]},
  {id:'ottoman',cat:N('Living room'),name:N('Pouf'),kind:'gen',w:0.6,d:0.6,h:0.42,color:'oak',colors:[...WOOD,'beige',...FABRIC],min:[0.39,0.45,0.34],max:[0.96,0.84,0.53]},
  {id:'diningTable',table:true,cat:N('Kitchen & dining'),name:N('Rectangular table'),kind:'gen',w:1.4,d:0.8,h:0.75,color:'oak',min:[0.7,0.6,0.6],max:[2.24,1.12,0.94]},
  {id:'console',cat:N('Hallway'),name:N('Console table'),kind:'gen',w:1,d:0.35,h:0.8,color:'oak',min:[0.65,0.26,0.64],max:[1.6,0.49,1.0]},
  {id:'coatHooks',cat:N('Hallway'),name:N('Coat rack'),kind:'gen',w:.8,d:.25,h:.35,lift:1.5,color:'oak',vars:[['shelf',N('With shelf')],['hooks',N('Hooks only')]],tags:N('hooks wall coat rack hanger'),min:[.3,.08,.15],max:[2,.35,.5]},
  {id:'wallMirror',cat:N('Hallway'),name:N('Mirror'),kind:'gen',w:.6,d:.03,h:.9,lift:1.1,color:'black',colors:['oak','walnut','white','black','chrome'],vars:[['rect',N('Rectangular|neuter')],['round',N('Round|neuter')],['arch',N('Arched')]],tags:N('wall mirror bathroom'),min:[.3,.02,.3],max:[1.6,.06,2]},
  {id:'stairs',cat:N('Hallway'),name:N('Staircase'),kind:'gen',w:.9,d:3.2,h:2.6,color:'oak',colors:[...WOOD,'black'],mirror:true,vars:[['solid',N('Solid steps')],['open',N('Open steps')]],
    tags:N('stairs staircase steps flight banister handrail second floor'),min:[.6,1.2,.6],max:[1.6,6,3]},
  {id:'coatStand',cat:N('Hallway'),name:N('Coat stand'),kind:'gen',w:.45,d:.45,h:1.8,color:'walnut',colors:['oak','walnut','white','black'],tags:N('coat stand hat stand hall tree clothes rack'),min:[.35,.35,1.5],max:[.7,.7,2]},
  {id:'shoeCabinet',cat:N('Hallway'),name:N('Shoe cabinet'),kind:'gen',w:0.8,d:0.3,h:1.1,color:'oak',min:[0.52,0.22,0.88],max:[1.28,0.42,1.38]},
  {id:'vanity',cat:N('Bathroom'),name:N('Sink cabinet'),kind:'gen',w:0.8,d:0.5,h:0.85,color:'white',vars:[['floor',N('Floor-standing|feminine')],['wall',N('Wall-hung|feminine')]],tags:N('vanity sink cabinet double sink washstand'),min:[0.52,0.38,0.68],max:[1.8,0.7,1.06]},
  {id:'toilet',cat:N('Bathroom'),name:N('Toilet'),kind:'gen',w:.38,d:.65,h:.8,color:'white',colors:['white','black'],vars:[['floor',N('Floor-standing')],['wall',N('Wall-hung')]],tags:N('toilet wc lavatory wall-hung'),min:[.34,.48,.38],max:[.9,.8,1.25]},
  {id:'bath',cat:N('Bathroom'),name:N('Bathtub'),kind:'gen',w:1.7,d:.75,h:.58,color:'white',colors:SANITARY,tags:N('bath tub bathing soak'),min:[1.2,.6,.45],max:[2,.95,.7]},
  {id:'bathFree',cat:N('Bathroom'),name:N('Freestanding bathtub'),kind:'gen',w:1.7,d:.8,h:.6,color:'white',colors:[...SANITARY,'sage','navy'],vars:[['oval',N('Oval|feminine')],['rect',N('Rectangular|feminine')]],tags:N('freestanding bathtub tub clawfoot legs'),min:[1.4,.65,.5],max:[2,1,.75]},
  {id:'walkIn',cat:N('Bathroom'),name:N('Walk-in shower'),kind:'gen',w:1.2,d:.9,h:2,color:'chrome',colors:['chrome','black'],mirror:true,tags:N('walk-in shower glass screen panel drain wet room'),min:[.8,.7,1.9],max:[2,1.4,2.4]},
  {id:'showerColumn',cat:N('Bathroom'),name:N('Shower set'),kind:'gen',w:.3,d:.35,h:1.2,lift:.85,color:'chrome',colors:['chrome','black'],tags:N('shower set column rain shower mixer faucet head'),min:[.2,.2,.8],max:[.4,.5,1.5]},
  {id:'bidet',cat:N('Bathroom'),name:N('Bidet'),kind:'gen',w:.36,d:.55,h:.4,color:'white',colors:['white','black'],vars:[['floor',N('Floor-standing|neuter')],['wall',N('Wall-hung|neuter')]],tags:N('bidet bathroom toilet'),min:[.33,.45,.35],max:[.42,.65,.45]},
  {id:'shower',cat:N('Bathroom'),name:N('Shower stall'),kind:'gen',w:.9,d:.9,h:2,color:'chrome',colors:['chrome','black'],vars:[['rect',N('Rectangular|feminine')],['round',N('Curved')]],mirror:true,tags:N('shower stall cabin enclosure tray corner'),min:[.7,.7,1.9],max:[1.6,1.2,2.3]},
  {id:'washer',cat:N('Bathroom'),name:N('Washing machine'),kind:'gen',w:.6,d:.55,h:.85,color:'white',colors:APPL,vars:[['front',N('Front-load'),{w:.6,d:.55}],['top',N('Top-load'),{w:.4,d:.6}]],tags:N('washing machine washer laundry'),min:[.55,.33,.8],max:[.65,.65,.9]},
  {id:'dryer',cat:N('Bathroom'),name:N('Dryer'),kind:'gen',w:.6,d:.6,h:.85,lift:0,color:'white',colors:APPL,tags:N('dryer tumble dryer laundry stack'),min:[.55,.45,.8],max:[.65,.7,.9]},
  {id:'laundryBasket',cat:N('Bathroom'),name:N('Laundry basket'),kind:'gen',w:.45,d:.35,h:.6,color:'linen',colors:['linen','white','grey','sand','graphite'],tags:N('laundry hamper basket clothes'),min:[.3,.25,.35],max:[.7,.5,.8]},
  {id:'dryingRack',cat:N('Bathroom'),name:N('Drying rack'),kind:'gen',w:1.6,d:.55,h:.95,color:'white',colors:['white','chrome'],vars:[['open',N('Unfolded'),{w:1.6,d:.55,h:.95}],['folded',N('Folded|feminine'),{w:.56,d:.06,h:1.1}]],tags:N('drying rack clothes airer laundry'),min:[.5,.04,.8],max:[2,.7,1.2]},
  {id:'ironingBoard',cat:N('Bathroom'),name:N('Ironing board'),kind:'gen',w:1.3,d:.38,h:.9,color:'grey',colors:['grey','linen','navy','sage'],vars:[['open',N('Unfolded'),{w:1.3,d:.38,h:.9}],['folded',N('Folded|feminine'),{w:.38,d:.08,h:1.35}]],tags:N('ironing iron laundry'),min:[.3,.06,.7],max:[1.5,.45,1.5]},
  {id:'robotVacuum',cat:N('Bathroom'),name:N('Robot vacuum'),kind:'gen',w:.38,d:.52,h:.12,color:'white',colors:['white','black'],tags:N('robot vacuum cleaner dock base cleaning'),min:[.3,.4,.08],max:[.5,.7,.5]},
  {id:'basin',cat:N('Bathroom'),name:N('Washbasin'),kind:'gen',w:.5,d:.42,h:.85,color:'white',colors:SANITARY,vars:[['wall',N('Wall-mounted|feminine')],['pedestal',N('Pedestal')]],tags:N('washbasin sink basin lavatory'),min:[.35,.3,.75],max:[1,.6,.95]},
  {id:'bathTall',cat:N('Bathroom'),name:N('Tall bathroom cabinet'),kind:'gen',w:.4,d:.3,h:1.7,color:'white',vars:[['floor',N('Floor-standing'),{z:0}],['wall',N('Wall-hung'),{z:.3}]],lift:0,tags:N('tall high cabinet bathroom storage'),min:[.3,.2,.8],max:[.6,.45,2.1]},
  {id:'waterHeater',cat:N('Bathroom'),name:N('Water heater'),kind:'gen',w:.45,d:.45,h:.8,lift:1.3,color:'white',colors:APPL,vars:[['round',N('Round'),{w:.45,d:.45}],['flat',N('Flat'),{w:.5,d:.3}]],tags:N('water heater boiler tank'),min:[.3,.2,.4],max:[.7,.55,1.3]},
  {id:'mirrorCabinet',cat:N('Bathroom'),name:N('Mirror cabinet'),kind:'gen',w:.6,d:.14,h:.7,lift:1.15,color:'white',tags:N('mirror cabinet medicine cabinet over sink'),min:[.3,.1,.4],max:[1.4,.22,1]},
  {id:'towelRail',cat:N('Bathroom'),name:N('Towel warmer'),kind:'gen',w:.5,d:.1,h:.8,lift:.6,color:'chrome',colors:['chrome','black','white'],vars:[['ladder',N('Ladder')],['snake',N('Serpentine')]],tags:N('towel warmer heated rail radiator'),min:[.35,.06,.4],max:[.8,.15,1.6]},
  {id:'bathShelf',cat:N('Bathroom'),name:N('Bathroom shelving'),kind:'gen',w:0.5,d:0.3,h:1.6,color:'white',min:[0.33,0.22,1.28],max:[0.8,0.42,2.0]},
  {id:'wallShelf',cat:N('Storage'),name:N('Wall shelf'),kind:'gen',w:.8,d:.22,h:.03,lift:1.2,color:'oak',tags:N('wall shelf floating ledge'),min:[.3,.12,.018],max:[2.4,.4,.06]},
  {id:'wardrobe',cat:N('Storage'),name:N('Cabinet'),kind:'gen',w:2.0,d:.6,h:2.4,color:'white',vars:[['hinged',N('Hinged')],['sliding',N('Sliding')]],tags:N('wardrobe closet armoire sliding'),min:[.4,.35,.6],max:[4,.8,2.7]},
  {id:'wardrobeCorner',cat:N('Storage'),name:N('Corner cabinet'),kind:'gen',w:1.2,d:1.2,h:2.4,color:'white',mirror:true,foot:{back:.6,side:.6},tags:N('corner wardrobe closet'),min:[1,1,1.6],max:[2,2,2.7]},
  {id:'openWardrobe',cat:N('Storage'),name:N('Open wardrobe'),kind:'gen',w:1,d:.5,h:2,color:'white',tags:N('walk-in closet wardrobe clothes rail hangers open storage system'),min:[.5,.35,1.4],max:[2,.65,2.7]},
  {id:'utilityCabinet',cat:N('Storage'),name:N('Utility cabinet'),kind:'gen',w:.6,d:.6,h:2,color:'white',tags:N('utility cabinet broom cleaning vacuum mop laundry'),min:[.4,.4,1.6],max:[1.2,.7,2.7]},
  {id:'displayCabinet',cat:N('Storage'),name:N('Display cabinet'),kind:'gen',w:.8,d:.4,h:1.9,color:'walnut',tags:N('display cabinet glass-door vitrine china curio'),min:[.5,.3,1.2],max:[1.6,.55,2.3]},
  {id:'sideboard',cat:N('Storage'),name:N('Sideboard'),kind:'gen',w:1.6,d:.45,h:.8,lift:0,color:'oak',tags:N('sideboard buffet credenza cabinet wall-mounted'),min:[.8,.35,.4],max:[3,.6,1.2]},
  {id:'shelf',cat:N('Storage'),name:N('Shelving unit'),kind:'gen',w:.9,d:.35,h:2.0,color:'oak',colors:[...WOOD,'black'],vars:[['books',N('Books')],['styled',N('Styled')],['boxes',N('Boxes')],['empty',N('Empty|plural')]],min:[.3,.2,.4],max:[3,.6,2.7]},
  {id:'bed',cat:N('Bedroom'),name:N('Bed'),kind:'gen',w:1.7,d:2.15,h:1.05,color:'oak',colors:[...WOOD,'beige',...FABRIC],
    vars:[['upholstered',N('Upholstered headboard')],['wood',N('Wooden headboard')]],min:[.8,1.9,.7],max:[2.2,2.3,1.4]},
  {id:'nightstand',cat:N('Bedroom'),name:N('Nightstand'),kind:'gen',w:.5,d:.4,h:.5,lift:0,color:'oak',colors:[...FACADE,'grey','black'],tags:N('nightstand bedside table wall-mounted floating'),min:[.3,.3,.3],max:[1.2,.6,.9]},
  {id:'dressingTable',table:.76,cat:N('Bedroom'),name:N('Dressing table'),kind:'gen',w:1,d:.45,h:1.45,color:'white',tags:N('dressing table vanity makeup mirror'),min:[.7,.35,1.1],max:[1.4,.6,1.7]},
  {id:'floorMirror',cat:N('Bedroom'),name:N('Floor mirror'),kind:'gen',w:.6,d:.3,h:1.7,color:'oak',colors:['oak','walnut','white','black','chrome'],tags:N('full-length mirror standing floor dressing'),min:[.4,.2,1.3],max:[1,.45,2]},
  {id:'clothesRack',cat:N('Bedroom'),name:N('Clothes rack'),kind:'gen',w:1.2,d:.45,h:1.6,color:'black',colors:['black','white','chrome','oak'],tags:N('clothes rack garment rail open wardrobe'),min:[.6,.35,1.2],max:[2,.6,2]},
  {id:'wardrobeRun',run:true,cat:N('Bedroom'),also:[N('Storage'),N('Hallway')],name:N('Built-in wardrobe'),kind:'gen',w:2.4,d:.6,h:2.5,color:'white',colors:['white','beige','oak','walnut','graphite','sage','navy'],vars:[['sliding',N('Sliding')],['hinged',N('Hinged')]],tags:N('wardrobe wall to wall built-in closet sliding niche fitted'),min:[.4,.35,1.6],max:[60,.9,2.7]},
  {id:'wallBed',cat:N('Bedroom'),name:N('Wall bed'),kind:'gen',w:1.6,d:.45,h:2.2,color:'white',vars:[['closed',N('Folded|feminine'),{d:.45}],['open',N('Unfolded'),{d:2.15}]],tags:N('wall bed murphy bed fold-down foldaway'),min:[1,.4,2],max:[2,2.3,2.5]},
  {id:'screen',cat:N('Bedroom'),name:N('Room divider'),kind:'gen',w:1.5,d:.35,h:1.7,color:'linen',colors:['linen','white','sand','grey','oak','walnut'],tags:N('room divider screen partition folding'),min:[.8,.2,1.2],max:[2.4,.6,2]},
  {id:'bedDouble',hidden:true,cat:N('Bedroom'),name:N('Bed'),kind:'kenney'},
  {id:'bedSingle',hidden:true,cat:N('Bedroom'),name:N('Single bed'),kind:'kenney'},
  {id:'cabinetBedDrawerTable',hidden:true,cat:N('Bedroom'),name:N('Nightstand'),kind:'kenney'},
  {id:'bookcaseOpen',hidden:true,cat:N('Storage'),name:N('Shelving unit'),kind:'kenney'},
  {id:'loungeSofa',cat:N('Living room'),name:N('Sofa'),kind:'gen',w:2.1,d:.95,h:.85,color:'grey',colors:FABRIC,min:[1.3,.8,.7],max:[3.4,1.2,1.1]},
  {id:'sofaCorner',cat:N('Living room'),name:N('Corner sofa'),kind:'gen',w:2.7,d:1.65,h:.85,color:'grey',colors:FABRIC,mirror:true,foot:{back:.95,side:.95},tags:N('sectional sofa chaise l-shaped couch'),min:[2,1.3,.7],max:[3.8,2.4,1.1]},
  {id:'sofaBed',cat:N('Living room'),name:N('Sofa bed'),kind:'gen',w:2,d:1,h:.85,color:'linen',colors:FABRIC,vars:[['day',N('Folded')],['night',N('Extended'),1.05]],tags:N('sofa bed sleeper pull-out futon click-clack'),min:[1.5,.85,.7],max:[2.4,2.4,1.1]},
  {id:'sofaU',cat:N('Living room'),name:N('U-shaped sofa'),kind:'gen',w:3.4,d:1.7,h:.85,color:'grey',colors:FABRIC,foot:{back:.95,side:.9,u:true},tags:N('modular sectional sofa u-shaped large couch'),min:[2.6,1.3,.7],max:[4.6,2.4,1.1]},
  {id:'loungeChair',cat:N('Living room'),name:N('Armchair'),kind:'gen',w:.85,d:.85,h:.8,color:'grey',colors:FABRIC,min:[.6,.65,.65],max:[1.2,1.1,1.1]},
  {id:'sideTable',cat:N('Living room'),name:N('Side table'),kind:'gen',w:.45,d:.45,h:.55,color:'oak',colors:['oak','walnut','white','black'],vars:[['round',N('Round')],['c',N('C-shaped')]],tags:N('side table end table sofa coffee'),min:[.3,.3,.4],max:[.7,.7,.7]},
  {id:'recliner',cat:N('Living room'),name:N('Recliner'),kind:'gen',w:.85,d:.95,h:1,color:'graphite',colors:FABRIC,vars:[['up',N('Upright')],['out',N('Reclined'),.5]],tags:N('recliner armchair footrest lounge chair'),min:[.7,.8,.9],max:[1.1,1.7,1.15]},
  {id:'chaise',cat:N('Living room'),name:N('Chaise longue'),kind:'gen',w:1.6,d:.7,h:.8,color:'sand',colors:FABRIC,mirror:true,tags:N('chaise longue lounge daybed ottoman settee'),min:[1.2,.55,.6],max:[2.1,.9,1]},
  {id:'soundbar',cat:N('Living room'),name:N('Soundbar'),kind:'gen',w:.9,d:.1,h:.07,lift:.5,color:'black',colors:['black','white','grey'],tags:N('soundbar speaker audio tv sound'),min:[.5,.06,.05],max:[1.4,.16,.12]},
  {id:'speaker',cat:N('Living room'),name:N('Floor speaker'),kind:'gen',w:.22,d:.3,h:1,color:'black',colors:['black','walnut','white'],tags:N('speaker loudspeaker audio hifi'),min:[.15,.2,.6],max:[.4,.5,1.4]},
  {id:'fireplace',cat:N('Living room'),name:N('Electric fireplace'),kind:'gen',w:1.2,d:.35,h:1.05,color:'white',colors:['white','oak','walnut','graphite'],tags:N('fireplace electric hearth mantel'),min:[.8,.25,.7],max:[2,.5,1.3]},
  {id:'piano',cat:N('Living room'),name:N('Piano'),kind:'gen',w:1.5,d:.6,h:1.25,color:'black',colors:['black','walnut','oak','white'],vars:[['upright',N('Upright'),{w:1.5,d:.6,h:1.25}],['digital',N('Digital'),{w:1.36,d:.4,h:.9}]],
    tags:N('piano upright digital keyboard music instrument'),min:[1,.3,.75],max:[1.9,.8,1.45]},
  {id:'tv',cat:N('Living room'),name:N('TV'),kind:'gen',w:1.23,d:.06,h:.71,lift:.8,color:'black',colors:SCREEN,min:[.6,.03,.35],max:[2.2,.12,1.25]},
  {id:'tableCoffee',round:['round'],cat:N('Living room'),name:N('Coffee table'),kind:'gen',w:1,d:.55,h:.42,color:'oak',vars:[['rect',N('Rectangular')],['round',N('Round')]],min:[.4,.4,.3],max:[1.6,1.1,.6]},
  {id:'kitchenBase',tops:true,run:true,colors:FACADE,cat:N('Kitchen & dining'),name:N('Base cabinets'),kind:'gen',w:2.4,d:.6,h:.9,color:'white',min:[.4,.4,.7],max:[60,.75,1]},
  {id:'kitchenWall',run:true,colors:FACADE,cat:N('Kitchen & dining'),name:N('Wall cabinets'),kind:'gen',w:2.4,d:.35,h:.7,color:'white',lift:1.45,min:[.4,.25,.3],max:[60,.5,1.2]},
  {id:'kitchenSink',tops:true,colors:FACADE,cat:N('Kitchen & dining'),name:N('Sink'),kind:'gen',w:.6,d:.6,h:.9,color:'white',vars:[['one',N('Single bowl')],['two',N('Double bowl'),{w:.9}]],tags:N('kitchen sink faucet module'),min:[.45,.5,.8],max:[1.2,.75,1]},
  {id:'kitchenHob',tops:true,colors:FACADE,cat:N('Kitchen & dining'),name:N('Cooktop'),kind:'gen',w:.6,d:.6,h:.9,color:'white',vars:[['drawers',N('Drawers')],['oven',N('Oven')]],tags:N('cooktop hob stove burners oven range module'),min:[.45,.5,.8],max:[.9,.75,1]},
  {id:'dishwasher',tops:true,colors:FACADE,cat:N('Kitchen & dining'),name:N('Dish­washer'),kind:'gen',w:.6,d:.6,h:.9,color:'white',tags:N('dishwasher built-in module'),min:[.45,.5,.8],max:[.6,.75,1]},
  {id:'kitchenCorner',tops:true,colors:FACADE,cat:N('Kitchen & dining'),name:N('Corner cabinet'),kind:'gen',w:1,d:1,h:.9,color:'white',mirror:true,foot:{back:.6,side:.6},tags:N('corner cabinet kitchen l-shaped module'),min:[.8,.8,.8],max:[1.4,1.4,1]},
  {id:'kitchenTall',colors:FACADE,cat:N('Kitchen & dining'),name:N('Tall cabinet'),kind:'gen',w:.6,d:.6,h:2.1,color:'white',vars:[['doors',N('Cabinet')],['oven',N('With oven')]],tags:N('tall high cabinet oven built-in pantry module'),min:[.3,.5,1.6],max:[.9,.75,2.7]},
  {id:'hood',cat:N('Kitchen & dining'),name:N('Range hood'),kind:'gen',w:.6,d:.5,h:.9,lift:1.55,color:'steel',colors:['steel','black','white'],vars:[['dome',N('Chimney')],['slant',N('Angled')]],min:[.5,.35,.3],max:[1.2,.6,1.4]},
  {id:'kitchenIsland',tops:true,table:.9,colors:FACADE,cat:N('Kitchen & dining'),name:N('Kitchen island'),kind:'gen',w:1.8,d:.95,h:.9,color:'white',tags:N('kitchen island peninsula breakfast bar counter'),min:[1,.6,.85],max:[3.2,1.4,1.1]},
  {id:'stove',cat:N('Kitchen & dining'),name:N('Stove'),kind:'gen',w:.6,d:.6,h:.85,color:'white',colors:APPL,vars:[['electric',N('Electric')],['gas',N('Gas')]],tags:N('stove range cooker freestanding gas electric oven'),min:[.5,.5,.8],max:[.9,.65,.95]},
  {id:'microwave',cat:N('Kitchen & dining'),name:N('Microwave'),kind:'gen',w:.5,d:.38,h:.3,lift:.9,color:'white',colors:APPL,tags:N('microwave oven'),min:[.4,.3,.25],max:[.65,.5,.4]},
  {id:'bin',cat:N('Kitchen & dining'),name:N('Trash can'),kind:'gen',w:.3,d:.3,h:.45,color:'steel',colors:['steel','white','black'],vars:[['bin',N('Bin'),{w:.3,d:.3,h:.45}],['sort',N('Recycling'),{w:.62,d:.36,h:.55}]],tags:N('trash garbage bin waste recycling'),min:[.2,.2,.3],max:[1,.5,.8]},
  {id:'kitchenCart',cat:N('Kitchen & dining'),name:N('Kitchen cart'),kind:'gen',w:.45,d:.35,h:.8,color:'white',colors:['white','black','sage','navy'],tags:N('cart trolley rolling utility cart wheels'),min:[.35,.3,.6],max:[.7,.5,1]},
  {id:'coffee',cat:N('Kitchen & dining'),name:N('Coffee machine'),kind:'gen',w:.25,d:.4,h:.38,lift:.9,color:'black',colors:['black','steel','white'],tags:N('coffee maker coffee machine espresso'),min:[.18,.3,.28],max:[.4,.5,.5]},
  {id:'fridge',cat:N('Kitchen & dining'),name:N('Refrigerator'),kind:'gen',w:.6,d:.65,h:1.85,color:'white',colors:APPL,vars:[['bottom',N('Fridge-freezer'),{w:.6,d:.65,h:1.85}],['sbs','Side-by-side',{w:.91,d:.72,h:1.78}],['french','French door',{w:.91,d:.72,h:1.78}]],tags:N('refrigerator fridge freezer side by side french door multi-door'),min:[.5,.5,1.4],max:[.95,.85,2.2]},
  {id:'tableExt',table:true,cat:N('Kitchen & dining'),name:N('Extendable table'),kind:'gen',w:1.4,d:.85,h:.75,color:'oak',vars:[['short',N('Folded'),{w:1.4}],['long',N('Extended'),{w:1.9}]],tags:N('extendable expandable folding dining table'),min:[1,.7,.7],max:[2.6,1.1,.8]},
  {id:'tableFold',table:true,cat:N('Kitchen & dining'),name:N('Drop-leaf table'),kind:'gen',w:.8,d:.6,h:.75,color:'oak',vars:[['open',N('Open|table'),{d:.6}],['closed',N('Folded'),{d:.06}]],tags:N('drop-leaf table wall-mounted folding small kitchen'),min:[.5,.04,.7],max:[1.2,.8,.8]},
  {id:'tableRound',round:true,table:true,cat:N('Kitchen & dining'),name:N('Round table'),kind:'gen',w:1.1,d:1.1,h:.75,color:'oak',tags:N('dining table oval round kitchen table'),min:[.6,.6,.6],max:[1.8,1.4,.9]},
  {id:'chairCushion',under:.48,cat:N('Kitchen & dining'),name:N('Chair'),kind:'gen',w:.45,d:.52,h:.85,color:'oak',colors:[...WOOD,'black'],tags:N('dining chair kitchen chair'),min:[.38,.4,.75],max:[.6,.65,1.05]},
  {id:'barStool',under:.68,cat:N('Kitchen & dining'),name:N('Bar stool'),kind:'gen',w:.42,d:.42,h:.9,color:'black',colors:['black','white','oak','walnut','chrome'],tags:N('bar stool counter stool island'),min:[.35,.35,.75],max:[.55,.55,1.2]},
  {id:'stool',under:true,cat:N('Kitchen & dining'),name:N('Stool'),kind:'gen',w:.34,d:.34,h:.45,color:'oak',colors:[...WOOD,'black'],vars:[['round',N('Round')],['square',N('Square')]],tags:N('stool seat'),min:[.28,.28,.3],max:[.45,.45,.75]},
  {id:'desk',table:true,cat:N('Home office'),name:N('Desk'),kind:'gen',w:1.2,d:.6,h:.75,color:'oak',tags:N('desk computer desk writing desk workstation'),min:[.8,.45,.65],max:[2.4,.9,.85]},
  {id:'deskCorner',table:true,cat:N('Home office'),name:N('Corner desk'),kind:'gen',w:1.4,d:1.2,h:.75,color:'oak',mirror:true,foot:{back:.6,side:.6},tags:N('corner desk l-shaped computer desk'),min:[1,1,.65],max:[2.2,2,.85]},
  {id:'deskStanding',table:true,cat:N('Home office'),name:N('Sit/stand desk'),kind:'gen',w:1.4,d:.7,h:.73,color:'oak',colors:[...WOOD,'black'],vars:[['sit',N('Sitting'),{h:.73}],['stand',N('Standing'),{h:1.1}]],tags:N('standing desk sit stand adjustable electric height'),min:[1,.6,.62],max:[2,.9,1.25]},
  {id:'pedestal',under:true,cat:N('Home office'),name:N('Rolling drawer unit'),kind:'gen',w:.4,d:.5,h:.58,color:'white',tags:N('drawer unit pedestal casters under desk'),min:[.3,.4,.45],max:[.5,.65,.65]},
  {id:'monitor',cat:N('Home office'),name:N('Monitor'),kind:'gen',w:.62,d:.2,h:.45,lift:.75,color:'black',colors:SCREEN,vars:[['stand',N('On stand')],['arm',N('On arm')]],tags:N('monitor screen display computer'),min:[.4,.12,.3],max:[1.5,.35,.7]},
  {id:'pcTower',under:true,cat:N('Home office'),name:N('PC tower'),kind:'gen',w:.21,d:.45,h:.45,lift:0,color:'black',colors:['black','white'],tags:N('computer pc desktop tower'),min:[.15,.3,.3],max:[.3,.6,.6]},
  {id:'printer',cat:N('Home office'),name:N('Printer'),kind:'gen',w:.42,d:.36,h:.3,lift:.75,color:'white',colors:['white','black'],tags:N('printer all-in-one scanner copier'),min:[.3,.25,.15],max:[.6,.55,.5]},
  {id:'chairDesk',under:.66,cat:N('Home office'),name:N('Office chair'),kind:'gen',w:.62,d:.62,h:1.05,color:'graphite',colors:['graphite','grey','black','navy','terracotta'],tags:N('office chair desk chair computer swivel task chair'),min:[.5,.5,.85],max:[.75,.75,1.3]},
  {id:'crib',cat:N('Kids\' room'),name:N('Crib'),kind:'gen',w:1.26,d:.66,h:.95,color:'white',tags:N('crib cot baby infant toddler nursery'),min:[1,.55,.8],max:[1.5,.8,1.1]},
  {id:'bunkBed',cat:N('Kids\' room'),name:N('Bunk bed'),kind:'gen',w:2.05,d:1,h:1.65,color:'oak',tags:N('bunk bed kids children'),min:[1.9,.8,1.4],max:[2.2,1.5,1.9]},
  {id:'loftBed',cat:N('Kids\' room'),name:N('Loft bed'),kind:'gen',w:2.05,d:1,h:.55,lift:1.2,color:'white',tags:N('loft bed desk underneath bunk'),min:[1.9,.8,.4],max:[2.2,1.5,.7]},
  {id:'changer',cat:N('Kids\' room'),name:N('Changing table'),kind:'gen',w:.9,d:.5,h:.98,color:'white',tags:N('changing table dresser baby nursery'),min:[.6,.4,.85],max:[1.3,.7,1.1]},
  {id:'highChair',cat:N('Kids\' room'),name:N('High chair'),kind:'gen',w:.55,d:.6,h:1,color:'white',tags:N('high chair baby feeding'),min:[.45,.5,.85],max:[.7,.8,1.1]},
  {id:'toyStorage',cat:N('Kids\' room'),name:N('Toy storage'),kind:'gen',w:.99,d:.44,h:.56,color:'white',vars:[['colorful',N('Colorful bins')],['neutral',N('Neutral bins')]],tags:N('toys toy storage boxes bins kids'),min:[.45,.3,.35],max:[2,.5,1.2]},
  {id:'playpen',cat:N('Kids\' room'),name:N('Playpen'),kind:'gen',w:1,d:1,h:.7,color:'white',colors:['white','grey','sand'],tags:N('playpen play yard baby toddler'),min:[.7,.7,.5],max:[1.5,1.5,.85]},
  {id:'kidsTable',table:true,cat:N('Kids\' room'),name:N('Children\'s table'),kind:'gen',w:.8,d:.55,h:.5,color:'white',tags:N('kids children play table activity'),min:[.5,.4,.4],max:[1.2,.8,.65]},
  {id:'wallBars',cat:N('Kids\' room'),name:N('Wall bars'),kind:'gen',w:.9,d:.9,h:2.3,color:'oak',colors:['oak','white','black'],vars:[['bar',N('With pull-up bar')],['plain',N('No pull-up bar'),{d:.15}]],tags:N('wall bars swedish ladder pull-up bar gym climbing kids sports'),min:[.6,.1,1.8],max:[1.2,1.2,2.7]},
  {id:'gasBoiler',cat:N('Climate'),name:N('Boiler'),kind:'gen',w:.42,d:.32,h:.72,lift:1.2,color:'white',colors:APPL,vars:[['wall',N('Wall-mounted')],['floor',N('Floor-standing'),{w:.6,d:.6,h:.85,z:0}]],tags:N('gas boiler furnace heating heat pump'),min:[.3,.2,.5],max:[.8,.8,1.6]},
  {id:'elPanel',cat:N('Climate'),name:N('Electrical panel'),kind:'gen',w:.4,d:.12,h:.5,lift:1.4,color:'white',colors:['white','grey'],tags:N('electrical panel breaker box fuse box meter'),min:[.25,.06,.25],max:[1,.25,1.2]},
  {id:'netRack',cat:N('Climate'),name:N('Network cabinet'),kind:'gen',w:.6,d:.6,h:1.2,color:'black',colors:['black','white'],vars:[['floor',N('Floor-standing')],['wall',N('Wall-mounted'),{w:.55,d:.45,h:.5,z:1.5}]],lift:0,tags:N('server rack router nas network cabinet home assistant'),min:[.4,.3,.3],max:[.8,1,2.2]},
  {id:'radiator',cat:N('Climate'),name:N('Radiator'),kind:'gen',w:1,d:.1,h:.5,lift:.12,color:'white',colors:['white','graphite','black'],vars:[['sections',N('Column')],['panel',N('Panel')]],tags:N('radiator heating heater'),min:[.3,.05,.2],max:[2.4,.2,1.8]},
  {id:'aircon',cat:N('Climate'),name:N('Air conditioner'),kind:'gen',w:.8,d:.22,h:.29,lift:2.15,color:'white',colors:APPL,tags:N('air conditioner ac split system climate cooling'),min:[.7,.18,.25],max:[1.2,.3,.36]},
  {id:'purifier',cat:N('Climate'),name:N('Air purifier'),kind:'gen',w:.3,d:.3,h:.6,color:'white',colors:['white','graphite'],tags:N('air purifier cleaner filter'),min:[.2,.2,.3],max:[.5,.5,1]},
  {id:'convector',cat:N('Climate'),name:N('Convector heater'),kind:'gen',w:.8,d:.1,h:.45,lift:.15,color:'white',colors:['white','graphite','black'],vars:[['wall',N('Wall-mounted'),{z:.15}],['floor',N('On legs'),{z:0}]],tags:N('convector heater electric panel heater'),min:[.4,.07,.3],max:[1.6,.15,.7]},
  {id:'thermostat',cat:N('Climate'),name:N('Thermostat'),kind:'gen',w:.09,d:.025,h:.09,lift:1.5,color:'white',colors:['white','black'],tags:N('thermostat temperature controller climate'),min:[.06,.015,.06],max:[.15,.05,.15]},
  {id:'humidifier',cat:N('Climate'),name:N('Humidifier'),kind:'gen',w:.25,d:.25,h:.35,lift:0,color:'white',colors:['white','graphite','black'],tags:N('humidifier air moisture'),min:[.15,.15,.2],max:[.45,.45,.7]},
  {id:'fan',cat:N('Climate'),name:N('Fan'),kind:'gen',w:.4,d:.35,h:1.2,color:'white',colors:['white','black'],tags:N('fan floor fan pedestal fan cooling'),min:[.3,.25,.6],max:[.6,.5,1.5]},
  {id:'car',free:true,cat:N('Garage & outdoor'),name:N('Car'),kind:'gen',w:1.85,d:4.7,h:1.44,color:'navy',colors:['navy','sage','terracotta','white','grey','graphite','black'],vars:[['sedan',N('Sedan')],['suv',N('SUV'),{w:1.98,d:4.9,h:1.8}]],tags:N('car vehicle automobile garage parking'),min:[1.5,3.5,1.3],max:[2.2,5.5,2]},
  {id:'bicycle',cat:N('Garage & outdoor'),name:N('Bike'),kind:'gen',w:.6,d:1.75,h:1.05,color:'black',colors:['black','white','navy','terracotta','sage'],tags:N('bicycle bike cycle'),min:[.4,1.2,.8],max:[.8,2,1.2]},
  {id:'workbench',cat:N('Garage & outdoor'),name:N('Workbench'),kind:'gen',w:1.5,d:.7,h:.9,color:'oak',tags:N('workbench workshop tools garage'),min:[.8,.5,.75],max:[2.5,1,1]},
  {id:'freezer',cat:N('Garage & outdoor'),name:N('Chest freezer'),kind:'gen',w:1,d:.65,h:.85,color:'white',colors:APPL,tags:N('chest freezer deep freezer pantry'),min:[.6,.5,.8],max:[1.6,.8,.95]},
  {id:'patioTable',round:['round'],table:true,cat:N('Garage & outdoor'),name:N('Outdoor table'),kind:'gen',w:1.2,d:.8,h:.74,color:'graphite',colors:['graphite','white','oak','sage'],vars:[['rect',N('Rectangular')],['round',N('Round')]],tags:N('balcony patio terrace garden outdoor table'),min:[.6,.6,.7],max:[2.2,1.2,.78]},
  {id:'patioChair',under:.46,cat:N('Garage & outdoor'),name:N('Outdoor chair'),kind:'gen',w:.56,d:.58,h:.82,color:'graphite',colors:['graphite','white','oak','sage'],tags:N('balcony patio terrace garden outdoor chair armchair'),min:[.45,.45,.7],max:[.7,.7,.95]},
  {id:'sunLounger',cat:N('Garage & outdoor'),name:N('Sun lounger'),kind:'gen',w:.65,d:1.95,h:.85,color:'white',colors:['white','graphite','oak'],tags:N('sun lounger chaise deck chair patio pool balcony'),min:[.55,1.6,.6],max:[.8,2.1,1]},
  {id:'grill',cat:N('Garage & outdoor'),name:N('Grill'),kind:'gen',w:.6,d:.6,h:1,color:'black',colors:['black','steel','terracotta'],tags:N('grill barbecue bbq patio terrace'),min:[.45,.45,.8],max:[1.4,.8,1.3]},
  {id:'curtains',cat:N('Lighting & decor'),name:N('Curtains'),kind:'gen',w:2,d:.14,h:2.55,color:'linen',colors:['linen','white','sand','grey','graphite','olive','navy','terracotta'],vars:[['open',N('Open|plural')],['closed',N('Closed|plural')]],fit:.4,soft:true,tags:N('curtains drapes sheer voile curtain rod window'),min:[.6,.08,1],max:[6,.25,2.6]},
  {id:'rug',round:['round','oval'],cat:N('Lighting & decor'),name:N('Rug'),kind:'gen',w:2,d:1.4,h:.012,color:'sand',color2:true,colors:['linen','sand','grey','graphite','olive','navy','terracotta'],vars:[['rect',N('Rectangular')],['round',N('Round')],['oval',N('Oval')]],soft:true,tags:N('rug carpet runner mat'),min:[.5,.5,.005],max:[5,5,.03]},
  {id:'blind',cat:N('Lighting & decor'),name:N('Roller blind'),kind:'gen',w:1.2,d:.06,h:1.5,lift:.9,color:'white',colors:['white','linen','sand','grey','graphite'],vars:[['roller',N('Roller')],['venetian',N('Venetian')],['daynight',N('Day-night')]],fit:.1,soft:true,tags:N('blinds roller shade roman day night zebra window'),min:[.3,.03,.3],max:[3,.1,2.4]},
  {id:'picture',cat:N('Lighting & decor'),name:N('Picture'),kind:'gen',w:.6,d:.03,h:.8,lift:1.2,color:'oak',colors:['oak','walnut','white','black'],vars:[['art',N('Picture')],['poster',N('Poster')],['botanical',N('Botanical print')]],tags:N('picture poster frame photo wall art'),min:[.2,.015,.2],max:[2,.06,1.6]},
  {id:'aquarium',cat:N('Lighting & decor'),name:N('Aquarium'),kind:'gen',w:1,d:.4,h:1.3,color:'walnut',colors:['walnut','oak','white','black'],tags:N('aquarium fish tank stand'),min:[.5,.3,.9],max:[1.8,.6,1.6]},
  {id:'catTree',cat:N('Lighting & decor'),name:N('Cat tree'),kind:'gen',w:.5,d:.5,h:1.2,color:'sand',colors:['sand','grey','linen','graphite'],tags:N('cat tree scratching post condo tower'),min:[.35,.35,.5],max:[.9,.9,1.9]},
  {id:'petBed',round:['round'],cat:N('Lighting & decor'),name:N('Pet bed'),kind:'gen',w:.7,d:.55,h:.2,color:'grey',colors:FABRIC,vars:[['round',N('Round|feminine')],['rect',N('Rectangular|feminine')]],tags:N('pet bed dog cat basket cushion'),min:[.35,.3,.1],max:[1.3,1,.35]},
  {id:'lampRoundFloor',cat:N('Lighting & decor'),name:N('Floor lamp'),kind:'gen',w:.42,d:.42,h:1.6,color:'linen',colors:['linen','white','sand','graphite'],tags:N('floor lamp standing light'),min:[.25,.25,1],max:[.7,.7,2]},
  {id:'pottedPlant',round:true,cat:N('Lighting & decor'),name:N('Plant'),kind:'gen',w:.8,d:.8,h:1,color:'white',colors:['white','sand','terracotta','graphite','black'],
    vars:[['monstera',N('Monstera'),{w:.8,d:.8,h:1}],['ficus',N('Fiddle-leaf fig'),{w:.6,d:.6,h:1.7}],['palm',N('Palm'),{w:.9,d:.9,h:1.6}],['snake',N('Snake plant'),{w:.35,d:.35,h:.85}],['flowers',N('Hydrangea'),{w:.55,d:.55,h:.65}]],
    tags:N('flower flowers pot floor plant monstera ficus fig palm snake plant sansevieria hydrangea houseplant'),min:[.25,.25,.3],max:[1.4,1.4,2.4]},
  {id:'decor',cat:N('Lighting & decor'),name:N('Tabletop decor'),kind:'gen',w:.3,d:.22,h:.2,lift:.75,color:'white',colors:['white','sand','terracotta','graphite','black','navy','oak','walnut'],
    vars:[['books',N('Books'),{w:.3,d:.22,h:.2}],['vase',N('Vase'),{w:.18,d:.18,h:.5}],['candles',N('Candles'),{w:.32,d:.14,h:.22}],['bowl',N('Fruit bowl'),{w:.32,d:.32,h:.14}],['dish',N('Bowl'),{w:.26,d:.26,h:.08}]],
    tags:N('decor tabletop books vase candles fruit bowl ornament styling shelf sideboard'),min:[.1,.08,.05],max:[.8,.5,.8]},
  {id:'floorVase',round:true,cat:N('Lighting & decor'),name:N('Floor vase'),kind:'gen',w:.4,d:.4,h:1.2,color:'sand',colors:['white','sand','terracotta','graphite','black'],
    vars:[['pampas',N('Dried flowers'),{w:.4,d:.4,h:1.2}],['eucalyptus',N('Eucalyptus'),{w:.55,d:.55,h:1.1}],['empty',N('Empty|feminine'),{w:.3,d:.3,h:.6}]],
    tags:N('vase floor dried flowers pampas grass branches eucalyptus decor'),min:[.15,.15,.3],max:[.8,.8,2]},
];
// loose: usually stands in the middle of a room (chairs, tables, island, rug): it snaps to a wall only when placed almost
// touching it, and only then turns its back to it (the owner: a chair sticking to the wall right away is not great). Everything else as before.
const LOOSE=['chairCushion','stool','barStool','chairDesk','highChair','ottoman','diningTable','tableRound','tableExt','tableCoffee','sideTable',
  'kidsTable','kitchenIsland','patioTable','patioChair','sunLounger','rug','petBed'];
for(const id of LOOSE){const c=CATALOG.find(x=>x.id===id);if(c)c.loose=true;}
// An item from parts (core/parts.js): the AI build describes what it could not match to the catalog; the shape is in the item (f.parts),
// the name in f.name. Never in the catalog picker; any size (it stretches to fit), no colors or variants: the parts carry their own materials.
CATALOG.push({id:'parts',hidden:true,cat:'',name:N('Custom item'),kind:'gen',w:.6,d:.4,h:.8,lift:0,min:[.01,.01,.01],max:[6,6,6]});
export const CATEGORIES=[N('Bedroom'),N('Living room'),N('Kitchen & dining'),N('Storage'),N('Home office'),N('Hallway'),N('Bathroom'),N('Kids\' room'),N('Climate'),N('Lighting & decor'),N('Garage & outdoor')];
// Names, sections, search tags, variants and colors are in the UI language (D-036). The translation keys are the English strings above
// (the scanner collects them from this whole file); the language is set before the module loads (i18n/boot.js).
for(const c of CATALOG){c.name=t(c.name);c.cat=t(c.cat);if(c.also)c.also=c.also.map(x=>t(x));if(c.tags)c.tags=t(c.tags);if(c.vars)for(const v of c.vars)v[1]=t(v[1]);}
CATEGORIES.forEach((c,i)=>{CATEGORIES[i]=t(c);});
for(const v of [...Object.values(COLORS),...Object.values(CAR_COLORS),...Object.values(TOPS)])v[0]=t(v[0]);
export const byId=id=>CATALOG.find(c=>c.id===id);
export const nameOf=f=>(f.name||byId(f.model)?.name||f.model).replace(/\u00ad/g,''); // a custom item uses its own name
// Frequent items come first in “All” and at the top of their category (the owner: scrolling through 111 cards is inconvenient).
export const TOP=['bed','nightstand','wardrobe','wardrobeRun','loungeSofa','sofaCorner','loungeChair','tableCoffee','tvStand','tv','diningTable','chairCushion','kitchenBase','kitchenWall','kitchenSink','kitchenHob','fridge','desk','chairDesk','shelf','dresser','toilet','bath','shower','vanity','washer','curtains','rug','pottedPlant','radiator','aircon'];
export const zOf=f=>f.z??byId(f.model)?.lift??0; // the item's bottom above the floor
export const lArms=f=>{const L=byId(f.model)?.foot;return L?{back:Math.min(L.back,f.d-.2),side:Math.min(L.side,(L.u?f.w/2:f.w)-.2),u:!!L.u}:null;};
export const extOf=f=>{const c=byId(f.model),v=c?.vars?.find(x=>x[0]===(f.v||c.vars[0][0]));return v?.[2]||0;}; // how far it is unfolded (sofa bed)
export const KENNEY=CATALOG.filter(c=>c.kind==='kenney').map(c=>c.id);
