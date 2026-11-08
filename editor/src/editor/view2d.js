// 2D plan view: metres to pixels, pan and zoom, a crisp canvas on Retina.
export function createView2d(cv){
  const ctx=cv.getContext('2d');
  const v={cv,ctx,sc:60,ox:60,oy:400,dpr:1,w:0,h:0,
    S:([x,y])=>[v.ox+x*v.sc,v.oy-y*v.sc],
    W:([X,Y])=>[(X-v.ox)/v.sc,(v.oy-Y)/v.sc],
    tol:(px=8)=>px/v.sc,
    resize(){const r=cv.getBoundingClientRect();v.dpr=Math.min(devicePixelRatio||1,2);v.w=r.width;v.h=r.height;cv.width=Math.round(r.width*v.dpr);cv.height=Math.round(r.height*v.dpr);},
    // Fit points into the window with margins; ins — how many pixels at the edges are covered by floating panels.
    fit(points,pad=50,{l=0,r=0,t=0,b=0}={}){
      const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      const [x0,x1,y0,y1]=xs.length?[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)]:[0,10,0,6];
      const W=Math.max(40,v.w-l-r),H=Math.max(40,v.h-t-b),p=Math.min(pad,W/6,H/6);
      v.sc=Math.max(5,Math.min(300,Math.min((W-2*p)/(x1-x0||1),(H-2*p)/(y1-y0||1))));
      v.ox=l+(W-(x1-x0)*v.sc)/2-x0*v.sc;v.oy=t+(H+(y1-y0)*v.sc)/2+y0*v.sc;
      return v.sc;
    },
    zoomAt(X,Y,k){const [x,y]=v.W([X,Y]);v.sc=Math.max(10,Math.min(600,v.sc*k));v.ox=X-x*v.sc;v.oy=Y+y*v.sc;},
    base(){ctx.setTransform(v.dpr,0,0,v.dpr,0,0);},
    path(points,close=true){ctx.beginPath();points.forEach((p,i)=>{const [X,Y]=v.S(p);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});if(close)ctx.closePath();},
    dot(p,r,fill,stroke,lw=1.5){const [X,Y]=v.S(p);ctx.beginPath();ctx.arc(X,Y,r,0,7);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}},
  };
  return v;
}
