import * as jsonr from "@airportyh/jsonr";
import { parse } from "play-lang/src/parser";
import { traverse } from "play-lang/src/traverser";
import { fitBox, Box, BoundingBox, TextBox } from "./fit-box";

const CODE_LINE_HEIGHT = 42;
const CODE_FONT_SIZE = 36;
const CODE_FONT_FAMILY = "Monaco";

type StackFrames = {
    funName: string,
    parameters: { [paramName: string]: any },
    variables:  { [varName: string]: any }
};

type HistoryEntry = {
    line: number,
    stack: StackFrames[],
    heap: { [id: number]: any }
};

async function main() {
    let dragging = false;
    let dragStartX: number;
    let dragStartY: number;
    const canvas = document.createElement("canvas");

    canvas.width = 1200;
    canvas.height = 1200;
    canvas.style.border = "1px solid black";
    canvas.style.transform = `scale(0.5) translate(-${canvas.width / 2}px, -${canvas.height / 2}px)`;

    let viewport = {
        top: - canvas.height / 2,
        left: - canvas.width / 2,
        zoom: 0.5
    };
    const ctx = canvas.getContext("2d");

    document.body.appendChild(canvas);
    
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
    
    requestRender();

    function requestRender() {
        requestAnimationFrame(render);
    }
    
    function renderFrameEntries(entries: HistoryEntry[], myBox: BoundingBox) {
        ctx.clearRect(myBox.x, myBox.y, myBox.width, myBox.height);
        const myArea = myBox.width * myBox.height;
        const myAreaRatio = myArea / (canvas.width * canvas.height);
        const firstEntry = entries[0];
        const currentStackHeight = firstEntry.stack.length;
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
            const stack = firstEntry.stack[firstEntry.stack.length - 1];
            const funName = stack.funName;
            const paramList = "(" + Object.values(stack.parameters).join(", ") + ")"
            fitBox(
                {
                    type: "text",
                    text: funName + paramList
                }, 
                myBox,
                CODE_FONT_FAMILY, "normal",
                ctx
            );
        } else {
            
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
            const callExprsBoxes = [];
            
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
            
            console.log("entriesThisFrame", entriesThisFrame);
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
            
            const bboxMap = fitBox(outerBox, myBox, CODE_FONT_FAMILY, "normal", ctx);
            for (let callExprBox of callExprsBoxes) {
                const { expr, box } = callExprBox;
                const bbox = bboxMap.get(box);
                //console.log("second pass render", { expr, box, bbox });
                const frameEntries = nestExecution[expr.start.line];
                if (frameEntries) {
                    //console.log("rendering frame entries!!!");
                    renderFrameEntries(frameEntries, bbox);
                }
            }
        }
    }
    
    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const box: BoundingBox = {
            y: 0,
            x: 0,
            width: canvas.width,
            height: canvas.height
        };
        const myBox = boxWorldToCanvas(box);
        ctx.strokeRect(myBox.x, myBox.y, myBox.width, myBox.height);
        
        renderFrameEntries(history, myBox);
        
        /*
        const myArea = myBox.width * myBox.height;
        const myAreaRatio = myArea / (canvas.width * canvas.height);
        const entries = history;
        const firstEntry = entries[0];
        const currentStackHeight = firstEntry.stack.length;
        const entriesThisFrame = entries.filter(entry => entry.stack.length === currentStackHeight);
        
        if (myAreaRatio < 0.5) {
            const funName = firstEntry.stack[0].funName;
            fitBox(
                {
                    type: "text",
                    text: funName + "()"
                }, 
                myBox,
                CODE_FONT_FAMILY, "normal",
                ctx
            );
        } else {
            
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
            const callExprsBoxes = [];
            
            // Render first line of function definition
            const funName = firstEntry.stack[0].funName;
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
            
            const bboxMap = fitBox(outerBox, myBox, CODE_FONT_FAMILY, "normal", ctx);
            for (let callExprBox of callExprsBoxes) {
                const { expr, box } = callExprBox;
                const bbox = bboxMap.get(box);
                // console.log("second pass render", { expr, box, bbox });
            }
            
            
        }
        */
        
        
        
        /*
        const funName = firstEntry.stack[0].funName;
        const funNode = findFunction(funName);
        const lineNo = funNode.start.line;
        const line = codeLines[lineNo - 1];
        const longestLineLength = entriesThisFrame.reduce((longestLength, entry) => {
            const lineNo = entry.line;
            const line = codeLines[lineNo - 1];
            if (line.length > longestLength) {
                return line.length;
            } else {
                return longestLength;
            }
        }, 0);
        outputLines.push(String(lineNo).padEnd(5, " ") + line);
        
        for (let i = 0; i < entriesThisFrame.length; i++) {
            let outputLine = "";
            const entry = entriesThisFrame[i];
            const nextEntry = entriesThisFrame[i + 1];
            if (nextEntry && entry.line === nextEntry.line) {
                continue;
            }
            const lineNo = entry.line;
            const line = codeLines[lineNo - 1];
            outputLine += String(lineNo).padEnd(5, " ") + line.padEnd(longestLineLength + 5, " ");
            
            // render var value if line is a var_assignment
            const astNode = findLine(lineNo);
            if (astNode && astNode.type === "var_assignment" && nextEntry) {
                const varName = astNode.var_name.value;
                const frame = nextEntry.stack[nextEntry.stack.length - 1];
                const varValue = frame.variables[varName];
                outputLine += `${varName} = ${varValue}`;
            }
            outputLines.push(outputLine);
        }
        
        const output = outputLines.join("\n");
        fitText(ctx, output, CODE_FONT_FAMILY, "normal", myBox, textMeasurer);
        */
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