#!/usr/bin/env python3
"""Purposeful HDB seller motion, drawn in code with Pillow and encoded by ffmpeg.

No network requests. Verified transaction data is a required input for exports.
Use --stills-only without --data to inspect layouts with deliberately blank data.
Mobile content ends above y=1000, leaving 280px for native controls and captions.
Desktop content ends above y=550, leaving 170px for native controls and captions.
"""
import argparse
import json
import math
import subprocess
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT.parents[2] / 'assets' / 'fonts'
DURATION = 30
FPS = 24
NAVY = '#142C40'
CREAM = '#F6F0E5'
PAPER = '#FFFCF6'
COPPER = '#A15A37'
PALE = '#E6D6C1'
MUTED = '#53606A'
LINE = '#D8CFC1'
TEAL = '#3F6762'
SCENES = [(0, 5), (5, 10), (10, 18), (18, 25), (25, 30)]
CHAPTERS = ['START WITH EVIDENCE', 'FIND YOUR BLOCK', 'COMPARE SALES', 'CHECK THE DIFFERENCES', 'TRY IT YOURSELF']


def clamp(v):
    return max(0., min(1., v))


def ease(v):
    v = clamp(v)
    return 1 - (1 - v) ** 3


def smooth(v):
    v = clamp(v)
    return v * v * (3 - 2 * v)


def lerp(a, b, t):
    return a + (b - a) * t


@lru_cache(maxsize=200)
def font(size, serif=False, weight=500):
    f = ImageFont.truetype(str(ASSETS / ('fraunces-latin.woff2' if serif else 'dm-sans-latin.woff2')), size)
    try:
        axes = []
        for axis in f.get_variation_axes():
            name = axis['name'].decode()
            axes.append(weight if name == 'Weight' else min(axis['maximum'], 144) if name == 'Optical Size' and serif else axis['default'])
        f.set_variation_by_axes(axes)
    except (AttributeError, OSError):
        pass
    return f


class Pen:
    """Logical-pixel drawing on a supersampled canvas."""
    def __init__(self, image, scale):
        self.im = image
        self.s = scale
        self.d = ImageDraw.Draw(image)

    def box(self, xy):
        return tuple(round(v * self.s) for v in xy)

    def rect(self, xy, fill, outline=None, width=1, radius=0):
        if radius:
            self.d.rounded_rectangle(self.box(xy), radius=round(radius * self.s), fill=fill, outline=outline, width=max(1, round(width * self.s)))
        else:
            self.d.rectangle(self.box(xy), fill=fill, outline=outline, width=max(1, round(width * self.s)))

    def line(self, points, fill=LINE, width=1):
        self.d.line(self.box(points), fill=fill, width=max(1, round(width * self.s)), joint='curve')

    def ellipse(self, xy, fill=None, outline=None, width=1):
        self.d.ellipse(self.box(xy), fill=fill, outline=outline, width=max(1, round(width * self.s)))

    def polygon(self, points, fill, outline=None):
        self.d.polygon([(round(x*self.s), round(y*self.s)) for x, y in points], fill=fill, outline=outline)

    def text(self, xy, text, size=24, fill=NAVY, serif=False, weight=500, anchor=None):
        self.d.text(self.box(xy), str(text), font=font(round(size*self.s), serif, weight), fill=fill, anchor=anchor, stroke_width=0)

    def textwidth(self, text, size=24, serif=False, weight=500):
        return self.d.textlength(str(text), font=font(round(size*self.s), serif, weight))/self.s

    def arc(self, xy, start, end, fill, width=4):
        self.d.arc(self.box(xy), start=start, end=end, fill=fill, width=round(width*self.s))


def arrow(p, x, y, color=NAVY, size=18, width=2):
    p.line((x-size, y, x+size, y), color, width)
    p.line((x+size-8, y-8, x+size, y, x+size-8, y+8), color, width)


def cursor(p, x, y, scale=1, click=0):
    # Actual cursor movement connects input, action, and result.
    if click > 0:
        r = 10 + 25*click
        p.ellipse((x-r, y-r, x+r, y+r), outline=COPPER, width=max(1, 3*(1-click)))
    pts = [(0,0), (0,29), (8,22), (15,37), (21,34), (14,20), (26,20)]
    p.polygon([(x+a*scale,y+b*scale) for a,b in pts], PAPER, NAVY)


def building(p, x, y, w, h, progress=1, dark=False, highlight=0, detail=True):
    """Original architectural illustration, not a depiction of the example address."""
    progress = ease(progress)
    outline = PALE if dark else NAVY
    wall = '#294255' if dark else '#E7DDD0'
    side = '#21384B' if dark else '#D7C7B4'
    balcony = '#395267' if dark else '#FBF8F0'
    copper = '#CD956B' if dark else COPPER
    base = y+h
    rise = max(14,h*progress)
    top = base-rise
    # Axonometric side and rooftop establish an unmistakable public housing block.
    p.polygon([(x+w*.86,top+12),(x+w,top-10),(x+w,base-18),(x+w*.86,base+6)], side)
    p.rect((x,top+12,x+w*.86,base+6), wall, outline,1.5)
    p.polygon([(x,top+12),(x+w*.14,top-10),(x+w,top-10),(x+w*.86,top+12)], balcony)
    p.line((x,top+12,x+w*.86,top+12,x+w,top-10),outline,1.5)
    p.rect((x+w*.37, top-19, x+w*.54, top+4),wall,outline,1)
    if progress > .4:
        levels = 9 if detail else 6
        step = h*.79/levels
        window_w = w*.082
        for floor in range(levels):
            fy = base-30-(floor+1)*step
            if fy < top+34:
                continue
            p.line((x+10,fy+step*.8,x+w*.84-4,fy+step*.8),outline,.75)
            for col in range(6):
                wx=x+w*.075+col*w*.125
                lit = (floor == highlight and col in (2,3))
                p.rect((wx,fy,wx+window_w,fy+step*.57), copper if lit else balcony,outline,.8)
                p.line((wx+window_w*.5,fy,wx+window_w*.5,fy+step*.57),outline,.7)
        p.rect((x+w*.37,base-22,x+w*.51,base+6),outline)
        p.line((x+w*.44,base-22,x+w*.44,base+6),wall,1)
    p.line((x-30,base+8,x+w+40,base+8),outline,1.5)
    if detail:
        for tx,ty,r in [(x-17,base-29,19),(x+w+18,base-34,23)]:
            p.line((tx,ty+10,tx,base+8),outline,1.4)
            p.ellipse((tx-r,ty-r,tx+r,ty+r),fill=TEAL if not dark else '#4C746A')
            p.line((tx,ty-6,tx,ty+12),CREAM,1)


def month_label(value):
    if not value:
        return '—'
    try:
        year, month = value.split('-')[:2]
        return f"{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][int(month)-1]} {year}"
    except (ValueError, IndexError):
        return str(value)


class Film:
    def __init__(self, mobile, data, scale=2):
        self.mobile = mobile
        self.w, self.h = (720,1280) if mobile else (1280,720)
        self.s = scale
        self.data = data or {}
        self.postal = str(self.data.get('postal', '••••••'))
        self.street = self.data.get('street', 'Verified example address')
        self.block = str(self.data.get('block', ''))
        self.flat_type = self.data.get('flat_type', '4 ROOM').replace(' ROOM','-room').replace('room','room')
        self.rows = self.data.get('transactions', [])[:3]
        self.scope = self.data.get('scope', 'street')
        if self.scope == 'block' and any(str(row.get('block')) != self.block for row in self.rows):
            raise ValueError('Block example contains records from another block')
        self.empty = not data

    def canvas(self, dark=False):
        return Image.new('RGB', (self.w*self.s,self.h*self.s), NAVY if dark else CREAM)

    def header(self, p, i, t, dark=False):
        color = CREAM if dark else NAVY
        muted = PALE if dark else MUTED
        x = 44 if self.mobile else 64
        p.text((x,34),'Joe Tay',29,color,True,600)
        p.text((x+129,43),'PROPERTY NOTES',12,muted,False,650)
        if self.mobile:
            p.text((self.w-x,42),f'{i+1:02d} / 05',15,color,False,650,'rt')
            p.line((x,91,self.w-x,91), '#455868' if dark else LINE,1)
        else:
            p.text((self.w-x,43),'A GUIDE FOR HDB SELLERS',13,muted,False,650,'rt')
            p.line((x,88,self.w-x,88), '#455868' if dark else LINE,1)
        # All informational content stays above the reserved caption area.
        py = 104
        available = self.w-2*x
        gap = 8
        span = (available-gap*4)/5
        for j,(start,end) in enumerate(SCENES):
            xx=x+j*(span+gap)
            p.line((xx,py,xx+span,py),'#455868' if dark else LINE,2)
            completed=clamp((t-start)/(end-start))
            if completed:
                p.line((xx,py,xx+span*completed,py),'#D59B70' if dark else COPPER,3)

    def hook(self, p, t):
        m=self.mobile
        dy=(1-ease(t/.8))*22
        x=48 if m else 68
        p.text((x,134+dy),'BEFORE YOU SELL',14,COPPER,False,700)
        lines=['Before you','choose an','asking price.']
        yy=177 if m else 177
        size=78 if m else 67
        step=88 if m else 77
        for k,s in enumerate(lines):
            p.text((x,yy+k*step+dy),s,size,NAVY,True,550)
        if m:
            p.text((x,469),'Start with recorded resale prices.',24,MUTED)
            building(p,161,553,383,341,clamp((t-.2)/1.7),highlight=int(t*.8)%6)
            p.text((360,936),'YOUR BLOCK IS THE STARTING POINT',12,COPPER,False,650,'mt')
        else:
            p.line((x,454,x+46,454),COPPER,2)
            p.text((x,477),'Start with recorded',25,MUTED)
            p.text((x,512),'HDB resale prices.',25,MUTED)
            building(p,773,165,334,347,clamp((t-.2)/1.7),highlight=int(t*.8)%6)
            p.text((934,532),'YOUR BLOCK IS THE STARTING POINT',12,COPPER,False,650,'mt')

    def search(self,p,t):
        m=self.mobile
        x=48 if m else 68
        p.text((x,132),'01 / FIND YOUR BLOCK',14,COPPER,False,700)
        for k,s in enumerate(['Start with','your block.']):
            p.text((x,(174 if m else 188)+k*(78 if m else 76)),s,69 if m else 64,NAVY,True,550)
        if not m:
            p.text((x,378),'One postal code.',24,MUTED)
            p.text((x,414),'Actual recorded sales.',24,MUTED)
            building(p,95,459,80,77,1,detail=False)
            p.text((204,505),'HDB resale lookup',17,MUTED)
        bx,by,bw,bh=(44,399,632,510) if m else (594,151,620,390)
        lift=18*(1-ease(t/.65))
        by+=lift
        p.rect((bx+5,by+8,bx+bw+5,by+bh+8),PALE,radius=22)
        p.rect((bx,by,bx+bw,by+bh),PAPER,LINE,1,22)
        p.line((bx,by+52,bx+bw,by+52),LINE,1)
        for j in range(3):
            p.ellipse((bx+24+j*15,by+22,bx+30+j*15,by+28),LINE)
        p.text((bx+bw/2,by+18),'joetay.com',13,MUTED,False,600,'mt')
        pad=32
        p.text((bx+pad,by+82),'What did flats in your',35 if m else 32,NAVY,True,550)
        p.text((bx+pad,by+125),'block sell for?',35 if m else 32,NAVY,True,550)
        p.text((bx+pad,by+180),'Your postal code',22,MUTED,False,600)
        fx,fy,fw,fh=bx+pad,by+213,bw-2*pad,66
        p.rect((fx,fy,fx+fw,fy+fh),PAPER,COPPER if t<3.4 else LINE,2,9)
        count=min(6,max(0,int((t-.35)/.23)))
        value=self.postal[:count]
        p.text((fx+20,fy+10),value,38,NAVY,False,550)
        if count<6 and int(t*3)%2==0:
            cx=fx+20+p.textwidth(value,38,weight=550)+3
            p.line((cx,fy+15,cx,fy+50),COPPER,2)
        btny=fy+88 if m else fy+82
        btnw=fw if m else 280
        p.rect((fx,btny,fx+btnw,btny+62),TEAL if t>2.65 else NAVY,radius=9)
        p.text((fx+22,btny+16),'Show sold prices',26,CREAM,False,650)
        arrow(p,fx+btnw-32,btny+32,CREAM,11)
        if m:
            p.text((fx,btny+89),'No name or phone needed.',24,MUTED)
            p.text((fx,btny+124),'An example using actual HDB records.',20,MUTED)
        else:
            p.text((fx+302,btny+10),'No name or',21,MUTED)
            p.text((fx+302,btny+36),'phone needed.',21,MUTED)
        ct=ease((t-1.9)/.60)
        cx=lerp(fx+fw-5,fx+btnw*.68,ct)
        cy=lerp(fy+12,btny+39,ct)
        if 1.75<t<2.95:
            cursor(p,cx,cy,.85,clamp((t-2.55)/.40) if 2.55<t<2.95 else 0)
        if t>2.95:
            # After search completes, the action area becomes the real flat-type choice.
            p.rect((fx-2,btny-2,fx+fw+2,btny+66),PAPER)
            p.text((fx,btny+17),'Flat type',24,MUTED)
            p.rect((fx+135,btny+9,fx+285,btny+55),NAVY,radius=23)
            p.text((fx+157,btny+17),self.flat_type,24,CREAM,False,650)
            cp=ease((t-2.95)/.55)
            cursor(p,lerp(cx,fx+260,cp),lerp(cy,btny+43,cp),.75)

    def results(self,p,t):
        m=self.mobile
        x=44 if m else 64
        p.text((x,132),'02 / COMPARE RECORDED SALES',14,COPPER,False,700)
        if m:
            p.text((x,176),'Same flat type.',64,NAVY,True,550)
            p.text((x,249),'Real sale prices.',64,NAVY,True,550)
            p.text((x,337),self.data.get('scope_label', self.street),25,MUTED,False,500)
            bx,by,bw=44,370,632
        else:
            p.text((x,166),'Same flat type. Real sale prices.',62,NAVY,True,550)
            p.text((x,239),self.data.get('scope_label', self.street),27,MUTED)
            bx,by,bw=64,280,1152
        pillw=p.textwidth(self.flat_type,24,weight=650)+38
        pillx=bx if m else bx+bw-pillw
        pilly=by-4 if m else 235
        p.rect((pillx,pilly,pillx+pillw,pilly+38),NAVY,radius=19)
        p.text((pillx+19,pilly+5),self.flat_type,24,CREAM,False,650)
        if m:
            p.text((pillx+pillw+15,pilly+8),'MATCHING FLAT TYPE',18,COPPER,False,650)
            by+=59
        colx=[bx+24,bx+(215 if m else 580),bx+bw-26]
        p.text((colx[0],by),'SOLD',24,MUTED,False,650)
        if not m:
            p.text((bx+315,by),'BLOCK',24,MUTED,False,650)
        p.text((colx[1],by),'STOREYS',24,MUTED,False,650)
        p.text((colx[2],by),'PRICE',24,MUTED,False,650,'rt')
        p.line((bx,by+41,bx+bw,by+41),NAVY,1.25)
        rowh=96 if m else 52
        for j in range(3):
            appear=ease((t-.45-j*.30)/.7)
            if appear<=0:
                continue
            ry=by+55+j*rowh+(1-appear)*20
            row=self.rows[j] if j<len(self.rows) else {}
            if j==1 and t>2.4:
                p.rect((bx,ry-7,bx+bw,ry+rowh-10),'#EADBC8',radius=9)
            month=month_label(row.get('month'))
            storeys=str(row.get('storey_range','—')).replace(' TO ','–').replace(' to ','–')
            price=f"${int(float(row['resale_price'])):,}" if row.get('resale_price') else '—'
            sz=32
            p.text((colx[0],ry+10),month,sz,NAVY,False,500)
            p.text((colx[1],ry+10),storeys,sz,NAVY,False,500)
            p.text((colx[2],ry+7),price,34,NAVY,False,650,'rt')
            if not m:
                p.text((bx+315,ry+10),row.get('block','—'),32,NAVY)
            if m:
                area=row.get('floor_area_sqm')
                area_label=f"{float(area):g} m²" if area else '— m²'
                p.text((colx[0],ry+58),f"Blk {row.get('block','—')}  ·  {area_label}",24,MUTED)
            p.line((bx,ry+rowh-5,bx+bw,ry+rowh-5),LINE,1)
        foot=by+55+3*rowh+(13 if m else 2)
        date=self.data.get('verified_at','Data pending verification')
        p.text((bx,foot),'HDB resale records via data.gov.sg',24 if m else 22,MUTED)
        if m:
            p.text((bx,foot+34),f'Example checked {date}',22,MUTED)
            if self.scope == 'block':
                p.text((bx,foot+81),'Recent registered sales in this block.',24,TEAL,False,600)
            else:
                p.text((bx,foot+81),'Street comparison across blocks.',24,MUTED,False,600)
        else:
            p.text((bx+bw,foot),f'Checked {date}',22,MUTED,False,500,'rt')
            label = 'Recent registered sales in this block.' if self.scope == 'block' else 'Street comparison across blocks.'
            p.text((bx,foot+28),label,22,TEAL if self.scope == 'block' else MUTED,False,600)
        if t>3:
            # A thin emphasis rule sweeps from dates to floors to prices. No invented uplift.
            phase=min(2,int((t-3)/1.4))
            left=colx[phase]
            right=left+(122 if m else 170)
            if phase==2:
                left=colx[2]-(150 if m else 185)
                right=colx[2]
            p.line((left,by+37,left+(right-left)*ease(((t-3)%1.4)/.45),by+37),COPPER,3)

    def factor_icon(self,p,kind,x,y,w,h,t):
        if kind==0:
            # Repeated identical homes, different vertical location.
            for row in range(4):
                yy=y+row*(h/4)
                p.rect((x,yy,x+w*.48,yy+h/4-5),PALE,radius=3)
                for col in range(3):
                    xx=x+9+col*w*.14
                    p.rect((xx,yy+6,xx+w*.08,yy+h/4-11),PAPER)
            lift=smooth((t%3)/2.1)
            floor=3-int(lift*3)
            yy=y+floor*(h/4)
            p.rect((x,yy,x+w*.48,yy+h/4-5),None,COPPER,2,3)
            p.line((x+w*.66,y+h-3,x+w*.66,y+4),COPPER,2)
            p.line((x+w*.66-6,y+12,x+w*.66,y+4,x+w*.66+6,y+12),COPPER,2)
        elif kind==1:
            # Renovation/condition is a home-specific comparison, never a price promise.
            p.rect((x,y,x+w*.78,y+h),PAPER,NAVY,1.5,4)
            p.polygon([(x,y+h*.72),(x+w*.78,y+h*.72),(x+w*.78,y+h),(x,y+h)],PALE)
            p.rect((x+12,y+13,x+w*.43,y+h*.55),None,NAVY,1)
            p.line((x+w*.28,y+13,x+w*.28,y+h*.55),NAVY,1)
            sweep=ease((t%3)/2)
            p.rect((x+w*.49,y+1,x+w*.49+(w*.28)*sweep,y+h*.71),'#CFB398')
            p.rect((x+17,y+h*.55,x+w*.62,y+h*.82),TEAL,radius=5)
            p.line((x+24,y+h*.82,x+24,y+h*.91),NAVY,2)
            p.line((x+w*.56,y+h*.82,x+w*.56,y+h*.91),NAVY,2)
        else:
            # A timeline without an invented lease balance or date.
            cy=y+h*.48
            p.line((x,cy,x+w*.87,cy),LINE,5)
            begin=x+w*.26
            p.line((begin,cy,lerp(begin,x+w*.87,ease((t-4)/.85)),cy),COPPER,5)
            p.ellipse((begin-6,cy-6,begin+6,cy+6),COPPER)
            for k in range(6):
                xx=x+k*w*.87/5
                p.line((xx,cy+13,xx,cy+20),MUTED,1)
            p.text((x,cy+29),'Start',12,MUTED)
            p.text((x+w*.87,cy+29),'End',12,MUTED,False,500,'rt')
            p.text((begin,cy-31),'REMAINING',11,COPPER,False,700)
            # Moving end bracket gives the graphic life without changing the data.
            p.line((x+w*.87,cy-12,x+w*.87,cy+12),COPPER,2)

    def factors(self,p,t):
        m=self.mobile
        x=44 if m else 64
        p.text((x,132),'03 / LOOK AT YOUR OWN HOME',14,COPPER,False,700)
        if m:
            p.text((x,176),'Then compare',64,NAVY,True,550)
            p.text((x,249),'the homes.',64,NAVY,True,550)
        else:
            p.text((x,170),'Then compare the homes.',64,NAVY,True,550)
        titles=['Floor','Condition','Remaining lease']
        descriptions=['Which storey is your unit on?','How does your home compare?','How much of the lease is left?']
        for i in range(3):
            progress=ease((t-.10-i*.22)/.6)
            if progress<=0:
                continue
            bx=x if m else x+i*393
            by=363+i*181 if m else 264
            bw=632 if m else 366
            bh=166 if m else 220
            by+=(1-progress)*20
            active=min(2,int(max(0,t-.6)/1.8))==i
            p.rect((bx,by,bx+bw,by+bh),PAPER,COPPER if active else LINE,1.3,15)
            p.text((bx+22,by+20),f'0{i+1}',13,COPPER,False,700)
            if m:
                self.factor_icon(p,i,bx+28,by+57,123,102,t)
                p.text((bx+193,by+43),titles[i],33,NAVY,True,550)
                words=[['Which storey is','your unit on?'],['How does your','home compare?'],['How much of the','lease is left?']][i]
                p.text((bx+193,by+99),words[0],24,MUTED)
                p.text((bx+193,by+128),words[1],24,MUTED)
            else:
                self.factor_icon(p,i,bx+27,by+56,100,95,t)
                p.text((bx+148,by+75),titles[i] if i<2 else 'Remaining',28,NAVY,True,550)
                if i==2:
                    p.text((bx+148,by+110),'lease',28,NAVY,True,550)
                words=[['Which storey is','your unit on?'],['How does your','home compare?'],['How much of the','lease is left?']][i]
                p.text((bx+24,by+155),words[0],24,MUTED)
                p.text((bx+24,by+185),words[1],24,MUTED)
        p.text((x,923 if m else 505),'Past sales are a starting point, not a valuation.',26 if m else 25,MUTED)

    def finale(self,p,t):
        m=self.mobile
        x=48 if m else 68
        dy=(1-ease(t/.7))*15
        p.text((x,133),'YOUR NEXT STEP',14,'#D59B70',False,700)
        lines=['Check your','block’s sold','prices.'] if m else ['Check your block’s','sold prices.']
        size=76 if m else 71
        yy=183
        for k,s in enumerate(lines):
            p.text((x,yy+k*(87 if m else 84)+dy),s,size,CREAM,True,550)
        by=515 if m else 370
        bw=624 if m else 644
        p.rect((x,by,x+bw,by+(87 if m else 74)),CREAM,radius=12)
        p.text((x+24,by+(25 if m else 18)),'Enter your postal code',26,NAVY,False,550)
        p.rect((x+bw-72,by+(13 if m else 10),x+bw-13,by+(74 if m else 64)),COPPER,radius=8)
        arrow(p,x+bw-42,by+(43 if m else 37),CREAM,13)
        p.text((x,by+(111 if m else 98)),'No name or phone needed.',25,CREAM)
        p.text((x,by+(159 if m else 139)),'joetay.com',26,'#D4BDA5')
        if m:
            building(p,311,757,170,184,ease(t/.8),dark=True,highlight=3,detail=False)
            p.text((48,810),'A clearer',30,CREAM,True,500)
            p.text((48,850),'starting point.',30,CREAM,True,500)
        else:
            building(p,894,235,231,284,ease(t/.8),dark=True,highlight=4,detail=True)
        if t>1.2:
            pp=ease((t-1.2)/1)
            cursor(p,lerp(x+bw-117,x+bw-45,pp),lerp(by+115,by+55,pp),.9)

    def scene(self,i,t):
        im=self.canvas(i==4)
        p=Pen(im,self.s)
        [self.hook,self.search,self.results,self.factors,self.finale][i](p,max(0,t))
        return im

    def render(self,t):
        i=max(j for j,(start,_) in enumerate(SCENES) if t>=start)
        local=t-SCENES[i][0]
        im=self.scene(i,local)
        # Brief spatial dissolves preserve continuity without withholding reading time.
        if i and local<.36:
            previous=self.scene(i-1,SCENES[i-1][1]-SCENES[i-1][0]+local)
            im=Image.blend(previous,im,smooth(local/.36))
        p=Pen(im,self.s)
        self.header(p,i,t,i==4 and local>=.18)
        if self.empty:
            p.text((self.w-25,105),'LAYOUT PREVIEW · NO VERIFIED DATA',10,COPPER,False,650,'rt')
        return im.resize((self.w,self.h),Image.Resampling.LANCZOS) if self.s!=1 else im


def contact_sheet(film,tag):
    samples=[2,6.4,8.9,11.3,15.5,19.2,22.3,27.8]
    keydir=ROOT/'keyframes'
    keydir.mkdir(parents=True,exist_ok=True)
    thumbs=[]
    tw=360 if film.mobile else 512
    th=round(tw*film.h/film.w)
    for n,t in enumerate(samples):
        frame=film.render(t)
        frame.save(keydir/f'{tag}-{n+1:02d}-{t:04.1f}s.png')
        if n==0:
            frame.save(ROOT/f'joetay-hdb-walkthrough-{tag}-poster.webp',quality=92)
        thumb=Image.new('RGB',(tw,th+28),CREAM)
        thumb.paste(frame.resize((tw,th),Image.Resampling.LANCZOS),(0,0))
        ImageDraw.Draw(thumb).text((8,th+5),f'{tag}  /  {t:.1f}s',font=font(13),fill=NAVY)
        thumbs.append(thumb)
    cols=4 if film.mobile else 2
    rows=math.ceil(len(thumbs)/cols)
    sheet=Image.new('RGB',(cols*tw,rows*(th+28)),CREAM)
    for n,thumb in enumerate(thumbs):
        sheet.paste(thumb,((n%cols)*tw,(n//cols)*(th+28)))
    sheet.save(ROOT/f'contact-sheet-{tag}.jpg',quality=93)


def main():
    global ASSETS
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--format',choices=['desktop','mobile','both'],default='both')
    ap.add_argument('--data',type=Path)
    ap.add_argument('--font-dir',type=Path,default=ASSETS,help='Directory containing fraunces-latin.woff2 and dm-sans-latin.woff2')
    ap.add_argument('--stills-only',action='store_true')
    ap.add_argument('--scale',type=int,default=2,choices=[1,2])
    args=ap.parse_args()
    ASSETS=args.font_dir
    data=json.loads(args.data.read_text()) if args.data else None
    if not args.stills_only:
        if not data or len(data.get('transactions',[]))<3:
            ap.error('Final export requires --data with at least three verified transactions.')
        required=['postal','block','street','flat_type','verified_at']
        if any(not data.get(key) for key in required):
            ap.error('Data requires: '+', '.join(required))
    for tag in (['desktop','mobile'] if args.format=='both' else [args.format]):
        film=Film(tag=='mobile',data,args.scale)
        contact_sheet(film,tag)
        if args.stills_only:
            continue
        output=ROOT/f'joetay-hdb-walkthrough-{tag}-silent.mp4'
        cmd=['ffmpeg','-y','-hide_banner','-loglevel','warning','-f','rawvideo','-pix_fmt','rgb24','-s',f'{film.w}x{film.h}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-profile:v','high','-movflags','+faststart','-metadata','title=Joe Tay — Before you choose an asking price','-metadata','comment=Programmatic HDB walkthrough. Example transactions from verified HDB records.','-threads','3',str(output)]
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        for n in range(FPS*DURATION):
            proc.stdin.write(film.render(n/FPS).tobytes())
            if n%(FPS*5)==0:
                print(f'{tag}: {n/FPS:.0f}/{DURATION}s',flush=True)
        proc.stdin.close()
        if proc.wait():
            raise RuntimeError('ffmpeg failed')
        print(f'Exported {output}',flush=True)


if __name__=='__main__':
    main()
