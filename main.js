

import OBR, { buildLabel, buildPath, Command } from "@owlbear-rodeo/sdk";

const ID = "com.tutorial.custom-tool";

let interaction = null;
let allMyItems = [];
let dragStartPos = null
let lastGridPos = null

let gridInfo = null


async function snapToGrid(pos) {
    return await OBR.scene.grid.snapPosition(pos, true, false)
}

async function getScale() {
    if (!gridInfo || !gridInfo.scale) {
        await loadGrid()
    }
    return gridInfo.scale
}


async function loadGrid() {
    gridInfo = {
        scale: await OBR.scene.grid.getScale(),
        dpi: await OBR.scene.grid.getDpi(),
        type: await OBR.scene.grid.getType(),
    }
}


function createTool() {
    OBR.tool.create({
        id: `${ID}/tool`,
        icons: [
            {
                icon: "/homer_stinkt.svg",
                label: "Homer stinkt",
            },
        ],
        defaultMetadata: {
            strokeColor: "white",
        },
    });
}

function createAction() {
    OBR.tool.createAction({
        id: `${ID}/delete`,
        icons: [
            {
                icon: "/delete.svg",
                label: "Clean up",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onClick(_, elementId) {
            allMyItems.forEach(([label, path]) => {
                OBR.scene.items.deleteItems([label.id, path.id]);
            });
            allMyItems = [];
        },
    });
    OBR.tool.createAction({
        id: `${ID}/color`,
        icons: [
            {
                icon: "/circle.svg",
                label: "Color",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onClick(_, elementId) {
            OBR.popover.open({
                id: `${ID}/color-picker`,
                height: 40,
                width: 80,
                url: "/color-picker.html",
                anchorElementId: elementId,
                anchorOrigin: {
                    horizontal: "CENTER",
                    vertical: "BOTTOM",
                },
                transformOrigin: {
                    horizontal: "CENTER",
                    vertical: "TOP",
                },
            });
        },
    });
}

function createMode() {
    OBR.tool.createMode({
        id: `${ID}/move`,
        icons: [
            {
                icon: "/move.svg",
                label: "Move",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onToolDragStart,
        onToolDragMove,
        onToolDragEnd,
        onToolDragCancel,
    });
    OBR.tool.createMode({
        id: `${ID}/measure`,
        icons: [
            {
                icon: "/measure.svg",
                label: "Measure",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onToolDragStart,
        onToolDragMove,
        onToolDragEnd,
        onToolDragCancel,
    });
    OBR.tool.createMode({
        id: `${ID}/draw`,
        icons: [
            {
                icon: "/draw.svg",
                label: "Draw",
                filter: {
                    activeTools: [`${ID}/tool`],
                },
            },
        ],
        onToolDragStart,
        onToolDragMove,
        onToolDragEnd,
        onToolDragCancel,
    });
}

async function onToolDragStart(context, event) {
    let strokeColor = "blue";
    if (typeof context.metadata.strokeColor === "string") {
        strokeColor = context.metadata.strokeColor;
    }
    let startPos = await snapToGrid(event.pointerPosition);
    dragStartPos = startPos
    let dragItem = null
    if (context.activeMode === `${ID}/move`) {
        if (event.target && event.target.layer === "CHARACTER") {
            dragItem = event.target;
        }
    }
    const path = buildPath()
        .commands([[Command.MOVE, startPos.x, startPos.y]])
        .fillColor("transparent")
        .strokeColor(strokeColor)
        .strokeWidth(50)
        .strokeOpacity(0.3)
        .locked(true)
        .layer("DRAWING")
        .build();
    const label = buildLabel()
        .plainText(`0${(await getScale()).parsed.unit}`)
        .position(startPos)
        .layer("NOTE")
        .build();
    let items = [label, path]
    if (dragItem) {
        items.push(dragItem);
    }
    interaction = await OBR.interaction.startItemInteraction(items);
}
async function onToolDragMove(context, event) {
    if (interaction) {
        const [update] = interaction;
        let newPos = await snapToGrid(event.pointerPosition);
        if (newPos.x === lastGridPos?.x && newPos.y === lastGridPos?.y) {
            return;
        }
        lastGridPos = newPos
        let scale = (await getScale()).parsed.unit
        let scale_multiplier = (await getScale()).parsed.multiplier
        update(([label, path, dragItem]) => {
            let lastCommand = path.commands[path.commands.length - 1];
            let lastLastCommand = path.commands[path.commands.length - 2];
            if (lastCommand) {
                if (lastCommand[1] === newPos.x && lastCommand[2] === newPos.y) {
                    return;
                }
            }
            if (lastLastCommand && lastLastCommand[1] === newPos.x && lastLastCommand[2] === newPos.y) {
                path.commands.pop();
            }
            else {
                path.commands.push([Command.LINE, newPos.x, newPos.y])
            }
            if (dragItem) {
                dragItem.position = newPos;
            }
            label.position = newPos;
            label.text.plainText = `${scale_multiplier * (path.commands.length - 1)}${scale}`;
        });
    }
}

async function onToolDragEnd(context, event) {
    if (interaction) {
        const [update, stop] = interaction;
        let newPos = await snapToGrid(event.pointerPosition);
        let [label, path, dragItem] = update(([label, path, dragItem]) => {
            if (dragItem) {
                OBR.scene.items.updateItems([dragItem], (items) => {
                    for (let item of items) {
                        item.position = newPos;
                    }
                })
            }
        });
        if (context.activeMode === `${ID}/draw`) {
            OBR.scene.items.addItems([label, path]);
            allMyItems.push([label, path]);
        }
        stop();
    }
    interaction = null;
}

function onToolDragCancel() {
    if (interaction) {
        const [update, stop] = interaction;
        let [label, path, dragItem] = update(([label, path, dragItem]) => {
            if (dragItem) {
                dragItem.position = dragStartPos
            }
        });
        stop();
    }
    interaction = null;
}



OBR.onReady(async () => {
    createTool();
    createMode();
    createAction();
    await loadGrid();
});

