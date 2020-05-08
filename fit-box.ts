import { sleep } from "simple-sleep";

/*
A bounding box is an rectangular area in a 2D canvas.
*/
export type BoundingBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/*
A box is either a text box or a container box.
*/
export type Box = TextBox | ContainerBox;

/*
A text box is a box that contains text. It always has type equal to "text".
*/
export type TextBox = {
    type: "text",
    text: string,
    color?: string
};

/*
A container box is a box that contains other boxes, which in turn
can either be text boxes or container boxes. It always has type equal to
"container". It has a direction which is either vertical or horizontal.
And it has a children array which contains its children boxes.
*/
export type ContainerBox = {
    type: "container",
    direction: "vertical" | "horizontal",
    children: Box[]
};

/* A point is a coordinate on the canvas 2D plane. */
export type Point = {
    y: number;
    x: number;
}

export type FontSetting = {
    size: number,
    family: string,
    weight: string
};

export class TextMeasurer {
    widthTable: { [key: string]: number } = {};
    ctx: CanvasRenderingContext2D;
    font: string;
    fontSetting: FontSetting;
    fixedWidthFontRatio: { [key: string]: number } = {};
    constructor(ctx: CanvasRenderingContext2D, private fixedWidth: boolean) {
        this.ctx = ctx;
    }
    
    setFont(fontSetting: FontSetting) {
        this.fontSetting = fontSetting;
        this.font = `${fontSetting.weight} ${fontSetting.size}px ${fontSetting.family}`;
        if (this.fixedWidth) {
            this.font = `${fontSetting.weight} ${fontSetting.size}px ${fontSetting.family}`;
            const key = `${fontSetting.weight}-${fontSetting.family}`;
            if (!(key in this.fixedWidthFontRatio)) {
                this.ctx.font = `${fontSetting.weight} 10px ${fontSetting.family}`;
                const ratio = this.ctx.measureText("i").width / 10;
                this.fixedWidthFontRatio[key] = ratio;
            }
        } else {
            this.ctx.font = this.font;
        }
    }

    measureText(text: string): number {
        if (this.fixedWidth) {
            const ratio = this.fixedWidthFontRatio[`${this.fontSetting.weight}-${this.fontSetting.family}`];
            return text.length * ratio * this.fontSetting.size;
        } else {
            let totalWidth = 0;
            for (let chr of text) {
                const chrKey = chr + this.font;
                let width = this.widthTable[chrKey];
                if (!width) {
                    width = this.ctx.measureText(chr).width;
                    this.widthTable[chrKey] = width;
                }
                totalWidth += width;
            }
            
            let width = totalWidth;
            if (this.fontSetting.size > 10000) {
                width = width * (this.fontSetting.size / 10000);
            }
            return width;
        }
    }
}


/*
Entry point of the fit box algorithm. Given a box to calculate the layout for,
bounding box to fit the box within, a specificed font family and font weight,
and a canvas rendering context (2D), it will first find the best layout for the box
to fit into the provided bounding box, and then it will render the box.
*/
export function fitBox(
    box: Box,
    bbox: BoundingBox,
    fontFamily: string,
    fontWeight: string,
    fixedWidth: boolean,
    textMeasurer: TextMeasurer,
    lineHeight: number,
    ctx: CanvasRenderingContext2D
) {
    let lowerFontSize: null | number = null;
    let upperFontSize: null | number = null;
    let fontSize = 5;
    let height: number, width: number;
    let bboxMap;
    ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
    while (true) {
        if (fontSize === 0) {
            throw new Error("Unexpected condition");
        }
        //console.log(`Trying fontSize: ${fontSize}`);
        textMeasurer.setFont({
            weight: fontWeight,
            size: fontSize,
            family: fontFamily
        });
        bboxMap = layout(box, { x: bbox.x, y: bbox.y }, fontSize, textMeasurer, lineHeight);
        const myBBox = bboxMap.get(box);
        const allFit = myBBox.height <= bbox.height && myBBox.width <= bbox.width;
        
        if (allFit) {
            //console.log("All fit");
            lowerFontSize = fontSize;
            if (upperFontSize) {
                const newFontSize = Math.floor((upperFontSize + fontSize) / 2);
                if (newFontSize === fontSize) {
                    //console.log("Break out of loop");
                    break;
                }
                fontSize = newFontSize;
            } else {
                fontSize *= 2;
            }
        } else {
            //console.log("Didn't fit");
            upperFontSize = fontSize;
            if (lowerFontSize) {
                const newFontSize = Math.floor((lowerFontSize + fontSize) / 2);
                if (newFontSize === fontSize) {
                    break;
                }
                fontSize = newFontSize;
            } else {
                fontSize = Math.floor(fontSize / 2);
            }
        }
    }
    
    //console.log("font size:", fontSize);
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const resultBBox = bboxMap.get(box);
    // compare resultBBox to bbox
    const xOffset = (bbox.width - resultBBox.width) / 2;
    const yOffset = (bbox.height - resultBBox.height) / 2;
    for (let aBox of bboxMap.keys()) {
        const aBBox = bboxMap.get(aBox);
        aBBox.x += xOffset;
        aBBox.y += yOffset;
    }
    render(box, bboxMap, fontSize, lineHeight, ctx);
    return bboxMap;
}

/*
Given a box, an offset, a font size, and a canvas rendering context. layout calculates
a bounding box for each box (parents and descendents included) as a map that maps a Box
to a BoundingBox.
*/
export function layout(
    box: Box, 
    offset: Point,
    fontSize: number,
    textMeasurer: TextMeasurer, 
    lineHeight: number):
    Map<Box, BoundingBox> {
    if (box.type === "text") {
        
        let width = textMeasurer.measureText(box.text);
        //console.log("measureText:", box.text, fontSize, "=", width);
        const height = fontSize * lineHeight;
        const bbox: BoundingBox = {
            ...offset,
            width: width,
            height
        };
        return new Map([[box, bbox]]);
    } else if (box.type === "container") {
        if (box.direction === "vertical") {
            const entries = [];
            let yOffset = offset.y;
            let myWidth = 0;
            let myHeight = 0;
            for (let child of box.children) {
                const bboxMap = layout(
                    child, 
                    { x: offset.x, y: yOffset }, 
                    fontSize, 
                    textMeasurer,
                    lineHeight
                );
                entries.push(...bboxMap);
                const childBBox = bboxMap.get(child);
                let previousYOffset = yOffset;
                yOffset += childBBox.height;
                if (previousYOffset >= 0 && yOffset < 0) {
                    throw new Error(`Number wrapped around: ${previousYOffset}, ${childBBox.height}, ${yOffset}`);
                }
                myHeight += childBBox.height;
                if (childBBox.width > myWidth) {
                    myWidth = childBBox.width;
                }
            }
            const containerBBox: BoundingBox = {
                ...offset,
                height: myHeight,
                width: myWidth
            };
            entries.push([box, containerBBox]);
            return new Map(entries);
        } else if (box.direction === "horizontal") {
            const entries = [];
            let xOffset = offset.x;
            let myWidth = 0;
            let myHeight = 0;
            for (let child of box.children) {
                const bboxMap = layout(
                    child, 
                    { x: xOffset, y: offset.y }, 
                    fontSize, 
                    textMeasurer,
                    lineHeight
                );
                entries.push(...bboxMap);
                const childBBox = bboxMap.get(child);
                let previousXOffset = xOffset;
                xOffset += childBBox.width;
                if (previousXOffset >= 0 && xOffset < 0) {
                    throw new Error(`Number wrapped around: ${previousXOffset}, ${childBBox.width}, ${xOffset}`);
                }
                myWidth += childBBox.width;
                if (childBBox.height > myHeight) {
                    myHeight = childBBox.height;
                }
            }
            const containerBBox: BoundingBox = {
                ...offset,
                height: myHeight,
                width: myWidth
            };
            entries.push([box, containerBBox]);
            return new Map(entries);
        } else {
            throw new Error("Not implemented");
        }
    } else {
        throw new Error("Not implemented");
    }
}

/*
Given a box and a mapping between box and bounding box (you can get
from layout, and a canvas rendering context, renders the box.

Pre-condition: You set the font property on the canvas context.
*/
export function render(
    box: Box,
    bBoxMap: Map<Box, BoundingBox>,
    fontSize: number,
    lineHeight: number,
    ctx: CanvasRenderingContext2D): void
    {
    if (box.type === "text") {
        const bbox = bBoxMap.get(box);
        ctx.save();
        if (box.color) {
            ctx.fillStyle = box.color;
        }
        const yOffset = fontSize * ((lineHeight - 1) / 2);
        ctx.fillText(box.text, bbox.x, bbox.y + yOffset);
        ctx.restore();
    } else if (box.type === "container") {
        for (let child of box.children) {
            render(child, bBoxMap, fontSize, lineHeight, ctx);
        }
        const bbox = bBoxMap.get(box);
    } else {
        throw new Error("Not implemented");
    }    
}

/*
Given a bounding box, and the canvas rendering context, draw its outline. 
*/
export function strokeBBox(bbox: BoundingBox, ctx: CanvasRenderingContext2D) {
    ctx.strokeRect(
        bbox.x, 
        bbox.y,
        bbox.width,
        bbox.height
    );
}


/*
async function main() {
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    canvas.style.border = "1px solid black";
    
    const ctx = canvas.getContext("2d");
    
    document.body.appendChild(canvas);
    const fontSize = 25;
    ctx.font = `normal ${fontSize}px Inconsolata`;
    ctx.textBaseline = "top";
    
    const bbox: BoundingBox = {
        x: 50,
        y: 50,
        width: 400,
        height: 200
    };
    
    strokeBBox(bbox, ctx);
    const box: Box = {
        type: "container",
        direction: "horizontal",
        children: [
            {
                type: "container",
                direction: "vertical",
                children: [
                    { type: "text", text: " 1" },
                    { type: "text", text: " 2" },
                    { type: "text", text: " 3" },
                    { type: "text", text: " 4" },
                    { type: "text", text: " 5" },
                    { type: "text", text: " 6" },
                    { type: "text", text: " 7" },
                    { type: "text", text: " 8" }
                ]
            },
            {
                type: "container",
                direction: "vertical",
                children: [
                    { type: "text", text: "def main() [" },
                    {
                        type: "container",
                        direction: "horizontal",
                        children: [
                            { type: "text", text: "  print(" },
                            { type: "text", text: "fib(7)" },
                            { type: "text", text: ")" }
                        ]
                    },
                    { type: "text", text: "]" },
                ]
            }
        ]
    };
    
    fitBox(box, bbox, "Inconsolata", "normal", ctx);
    
}

main().catch(err => console.log(err.stack));

*/