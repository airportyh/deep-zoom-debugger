import * as jsonr from "@airportyh/jsonr";
import { parse } from "play-lang/src/parser";
import { traverse } from "play-lang/src/traverser";
import { fitBox, Box, BoundingBox, TextBox, TextMeasurer } from "./fit-box";

const CODE_LINE_HEIGHT = 42;
const CODE_FONT_SIZE = 36;
const CODE_FONT_FAMILY = "Monaco";

type StackFrame = {
    funName: string,
    parameters: { [paramName: string]: any },
    variables:  { [varName: string]: any }
};

type HistoryEntry = {
    line: number,
    stack: StackFrame[],
    heap: { [id: number]: any }
};

async function main() {
    let dragging = false;
    let dragStartX: number;
    let dragStartY: number;
    const canvas = document.createElement("canvas");
    const log = document.createElement("pre");
    log.style.position = "absolute";
    log.style.bottom = "1px";

    canvas.width = 1200;
    canvas.height = 1200;
    canvas.style.border = "1px solid black";
    canvas.style.transform = `scale(0.5) translate(-${canvas.width / 2}px, -${canvas.height / 2}px)`;

    let viewport = {
        top: - canvas.height / 2,
        left: - canvas.width / 2,
        zoom: 0.5
        /*left: 899.2,
        top: 154.122,
        zoom: 137.39*/
    };
    const ctx = canvas.getContext("2d");

    document.body.appendChild(canvas);
    document.body.appendChild(log);
    
    window.addEventListener("mousedown", (e: MouseEvent) => {
        dragging = true;
        [dragStartX, dragStartY] = pointScreenToCanvas(e);
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });

    window.addEventListener("mousemove", (e: MouseEvent) => {
        if (dragging) {
            const [pointerX, pointerY] = pointScreenToCanvas(e);
            const [worldPointerX, worldPointerY] = pointCanvasToWorld(pointerX, pointerY);
            const [worldDragStartX, worldDragStartY] = pointCanvasToWorld(dragStartX, dragStartY);
            viewport.left -= worldPointerX - worldDragStartX;
            viewport.top -= worldPointerY - worldDragStartY;
            dragStartX = pointerX;
            dragStartY = pointerY;
            requestRender();
        }
    });
    
    window.addEventListener("wheel", function (e: any) {
        e.preventDefault();
        const delta = e.deltaY;
        const [pointerX, pointerY] = pointScreenToCanvas(e);
        const newZoom = Math.max(0.5, viewport.zoom * (1 - delta * 0.01));

        const [worldPointerX, worldPointerY] = pointCanvasToWorld(pointerX, pointerY);
        const newLeft = - (pointerX / newZoom - worldPointerX);
        const newTop = - (pointerY / newZoom - worldPointerY);
        const newViewport = {
            top: newTop,
            left: newLeft,
            zoom: newZoom
        };
        viewport = newViewport;
        
        requestRender();
      }, { passive: false });

    function pointScreenToCanvas(e: MouseEvent): [number, number] {
        return [
            (e.clientX - canvas.offsetLeft - 1) * 2,
            (e.clientY - canvas.offsetTop - 1) * 2
        ];
    }
    
    function pointCanvasToWorld(x: number, y: number): [number, number] {
        return [
            x / viewport.zoom + viewport.left,
            y / viewport.zoom + viewport.top
        ];
    }

    function boxWorldToCanvas(box: BoundingBox): BoundingBox {
        return {
            y: (box.y - viewport.top) * viewport.zoom,
            x: (box.x - viewport.left) * viewport.zoom,
            width: box.width * viewport.zoom,
            height: box.height * viewport.zoom
        };
    }
    
    
    const code = await fetchText("fib-recurse.play");
    const ast = parse(code);
    const historyText = await fetchText("fib-recurse.history");
    const history: HistoryEntry[] = jsonr.parse(historyText);
    ctx.textBaseline = "top";
    const textMeasurer = new TextMeasurer(ctx, true);
    
    /*
    const outerBox = {
        "type": "container",
        "direction": "horizontal",
        "children": [
          {
            "type": "container",
            "direction": "vertical",
            "children": [
              {
                "type": "text",
                "text": "13"
              },
              {
                "type": "text",
                "text": "14"
              },
              {
                "type": "text",
                "text": "15"
              }
            ]
          },
          {
            "type": "container",
            "direction": "vertical",
            "children": [
              {
                "type": "text",
                "text": "def main() ["
              },
              {
                "type": "container",
                "direction": "horizontal",
                "children": [
                  {
                    "type": "text",
                    "text": "    print("
                  },
                  {
                    "type": "text",
                    "text": "fib(7)"
                  },
                  {
                    "type": "text",
                    "text": ")"
                  }
                ]
              },
              {
                "type": "text",
                "text": "]"
              }
            ]
          }
        ]
      }
    const badBox = {
      "y": -14534.526716351218,
      "x": -85603.17608775802,
      "width": 114249.68877494133,
      "height": 114249.68877494133
    };
    const goodBox = {
      "y": -14416.323159448202,
      "x": -84930.3908746029,
      "width": 113358.67199774715,
      "height": 113358.67199774715
    };
    */
    /*
    for (let i = 5; i < 12000; i += 5) {
        ctx.font = `normal ${i}px ${CODE_FONT_FAMILY}`;
        console.log(`${i}px`, ctx.measureText("d").width);
    }
    */
    
    /*
    
    ctx.font = `normal 110px ${CODE_FONT_FAMILY}`;
    const str = "d";
    console.log(ctx.measureText(str).width);
    console.log(ctx.measureText(" ").width * str.length);
    */
    /*
    const result = fitBox(outerBox as any, goodBox as any, CODE_FONT_FAMILY, "normal",
    ctx);
    console.log(result);
    */
    /*
    const screenBox = boxWorldToCanvas({
        x: 0, y: 0,
        width: 1200, height: 1200
    });
    const text: Box = { type: "text", text: "Hello, world" };
    console.log("screenBox", screenBox);
    const bboxMap = fitBox(
        text,
        screenBox,
        CODE_FONT_FAMILY,
        "normal",
        ctx
    );
    */
    
    
    
    requestRender();

    function requestRender() {
        requestAnimationFrame(render);
    }
    
    function renderFrameEntries(entries: HistoryEntry[], myBox: BoundingBox, level: number) {
        const indent = Array(level + 1).join("  ");
        ctx.clearRect(myBox.x, myBox.y, myBox.width, myBox.height);
        const myArea = myBox.width * myBox.height;
        const myAreaRatio = myArea / (canvas.width * canvas.height);
        const firstEntry = entries[0];
        const stackFrame = firstEntry.stack[firstEntry.stack.length - 1];
        /*console.log(
            indent + "renderFrameEntries", 
            level,
            entries.length, 
            stackFrame.funName, 
            "(" + 
                Object.keys(stackFrame.parameters).map(key => `${key}=${stackFrame.parameters[key]}`).join(", ") +
            ")",
            //"myBox", myBox
        );
        */
        
        const currentStackHeight = firstEntry.stack.length;
        // Assumes that one line can only contain one function call
        const nestExecution: { [line: number]: HistoryEntry[] } = {};
        const entriesThisFrame = [];
        //entries.filter(entry => entry.stack.length === currentStackHeight);
        for (let entry of entries) {
            if (entry.stack.length === currentStackHeight) {
                entriesThisFrame.push(entry);
            } else {
                const lastEntryThisFrame = entriesThisFrame[entriesThisFrame.length - 1];
                const lineNo = lastEntryThisFrame.line;
                if (!nestExecution[lineNo]) {
                    nestExecution[lineNo] = [];
                }
                nestExecution[lineNo].push(entry);
            }
        }
        
        //console.log("renderFrameEntries for", 
        //    firstEntry.stack[firstEntry.stack.length - 1].funName);
        
        
        //console.log("nestedExecution", nestExecution);
        
        if (myAreaRatio < 0.5) {
            //console.log(indent + "myAreaRatio < 0.5");
            const stack = firstEntry.stack[firstEntry.stack.length - 1];
            const funName = stack.funName;
            const paramList = "(" + Object.values(stack.parameters).join(", ") + ")";
            const textBox: TextBox = {
                type: "text",
                text: funName + paramList
            };
            const bboxMap = fitBox(
                textBox, 
                myBox,
                CODE_FONT_FAMILY, 
                "normal",
                true,
                textMeasurer,
                ctx
            );
            
        } else {
            //console.log(indent + "myAreaRatio >= 0.5");
            const outerBox: Box = {
                type: "container",
                direction: "horizontal",
                children: []
            };
            const lineNumberBox: Box = {
                type: "container",
                direction: "vertical",
                children: []
            };
            outerBox.children.push(lineNumberBox);
            
            const codeBox: Box = {
                type: "container",
                direction: "vertical",
                children: []
            }
            outerBox.children.push(codeBox);
            
            
            const codeLines = code.split("\n");
            const callExprsBoxes: Array<{ expr: any /* AST node */, box: TextBox }> = [];
            
            // Render first line of function definition
            const stack = firstEntry.stack[firstEntry.stack.length - 1];
            const funName = stack.funName;
            const funNode = findFunction(funName);
            const callExprs = findCallExpressions(funNode);
            const userDefinedFunctions = findFunctionDefinitions(ast);
            const userDefinedFunctionNames = userDefinedFunctions.map(fun => fun.name.value);
            const callExprsUser = callExprs.filter(expr => {
                return userDefinedFunctionNames.includes(expr.fun_name.value);
            });
            const lineNo = funNode.start.line;
            const line = codeLines[lineNo - 1];
            lineNumberBox.children.push({
                type: "text",
                text: String(lineNo)
            });
            const codeLine = codeLines[lineNo - 1];
            codeBox.children.push({
                type: "text",
                text: codeLine
            });
            
            for (let i = 0; i < entriesThisFrame.length; i++) {
                let outputLine = "";
                const entry = entriesThisFrame[i];
                const nextEntry = entriesThisFrame[i + 1];
                const lineNo = entry.line;
                if (nextEntry && entry.line === nextEntry.line) {
                    continue;
                }
                lineNumberBox.children.push({
                    type: "text",
                    text: String(lineNo)
                });
                
                const codeLine = codeLines[lineNo - 1];
                // TODO: handle multiple call exprs on same line
                const callExpr = callExprsUser.find(expr => {
                    return expr.start.line === lineNo
                });
                if (callExpr) {
                    const firstChunk = codeLine.slice(0, callExpr.start.col);
                    const secondChunk = codeLine.slice(callExpr.start.col, callExpr.end.col);
                    const thirdChunk = codeLine.slice(callExpr.end.col);
                    const callExprBox: TextBox = {
                        type: "text",
                        text: secondChunk
                    };
                    callExprsBoxes.push({
                        expr: callExpr,
                        box: callExprBox
                    });
                    const lineBox: Box = {
                        type: "container",
                        direction: "horizontal",
                        children: [
                            {
                                type: "text",
                                text: firstChunk
                            },
                            callExprBox,
                            {
                                type: "text",
                                text: thirdChunk
                            }
                        ]
                    };
                    codeBox.children.push(lineBox);
                } else {
                    codeBox.children.push({
                        type: "text",
                        text: codeLine
                    });
                }
            }
            
        
            const bboxMap = fitBox(outerBox, myBox, CODE_FONT_FAMILY, "normal", true, textMeasurer, ctx);
            /*
            
            Code trying to implement current scope
            let newCurrentScope, newCurrentScopeBBox;
            for (let callExprsBox of callExprsBoxes) {
                const textBox = callExprsBox.box;
                const bbox = bboxMap.get(textBox);
                const containsViewPort = bbox.x <= 0 && bbox.y <= 0 &&
                    (bbox.width - 1200 >= 0) && (bbox.height - 1200 >= 0);
                if (containsViewPort) {
                    newCurrentScope = callExprsBox;
                    newCurrentScopeBBox = bbox;
                    break;
                }
            }
            if (newCurrentScope) {
                console.log("Found sub current scope!", newCurrentScope.box);
            } else {
                console.log("No sub current scope found");
            }
            */
            
            
            //console.log(indent + "outerBox", outerBox, "myBox", myBox, "bboxMap", bboxMap);
            for (let callExprBox of callExprsBoxes) {
                const { expr, box } = callExprBox;
                const bbox = bboxMap.get(box);
                //console.log("second pass render", { expr, box, bbox });
                const frameEntries = nestExecution[expr.start.line];
                if (frameEntries) {
                    //console.log("rendering frame entries!!!");
                    renderFrameEntries(frameEntries, bbox, level + 1);
                }
            }
        }
    }
    
    function updateLog() {
        return;
        const width = canvas.width / viewport.zoom;
        const height = canvas.height / viewport.zoom;
        const box: BoundingBox = {
            y: 0,
            x: 0,
            width: canvas.width,
            height: canvas.height
        };
        const myBox = boxWorldToCanvas(box);
        const display = 
            `Left: ${viewport.left.toFixed(2)}, Top: ${viewport.top.toFixed(2)}, Zoom: ${viewport.zoom.toFixed(2)}, Width: ${width.toFixed(2)}, Height: ${height.toFixed(2)} <br>` +
            `World box: (X: ${myBox.x.toFixed(2)}, Y: ${myBox.y.toFixed(2)}, Width: ${myBox.width.toFixed(2)}, Height: ${myBox.height.toFixed(2)})`;
        
        log.innerHTML = display;
    }
    
    function render() {
        updateLog();
        //console.log("render");
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const box: BoundingBox = {
            y: 0,
            x: 0,
            width: canvas.width,
            height: canvas.height
        };
        const myBox = boxWorldToCanvas(box);
        //console.log("canvas coordinate", myBox);
        ctx.strokeRect(myBox.x, myBox.y, myBox.width, myBox.height);
        
        renderFrameEntries(history, myBox, 0);
        
        //console.log("render complete");
    }
    
    function findLine(lineNo) {
        let found;
        traverse(ast, (node) => {
            if (node.start && node.start.line === lineNo) {
                found = node;
                return false;
            } else {
                return undefined;
            }
        });
        return found;
    }

    function findFunction(name) {
        let fun;
        traverse(ast, (node) => {
            if (node.type === "function_definition" && node.name.value === name) {
                fun = node;
            }
        });
        return fun;
    }
    
    function findCallExpressions(node) {
        let calls = [];
        traverse(node, (childNode) => {
            if (childNode.type === "call_expression") {
                calls.push(childNode);
            }
        });
        return calls;
    }
    
    function findFunctionDefinitions(node) {
        let defs = [];
        traverse(node, (childNode) => {
            if (childNode.type === "function_definition") {
                defs.push(childNode);
            }
        });
        return defs;
    }

    function getSource(node) {
        return code.slice(node.start.offset, node.end.offset);
    }
}



async function fetchText(filename) {
    const request = await fetch(filename);
    return request.text();
}

main().catch(err => console.log(err.stack));