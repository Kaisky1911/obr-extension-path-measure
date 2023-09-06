

import OBR, { buildLabel, buildPath, Command } from "@owlbear-rodeo/sdk";

const ID = "com.tutorial.custom-tool";


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
}


let interaction = null;
let allMyItems = [];
let dragItem = null

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
        label: "measure",
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
  let startPos = await OBR.scene.grid.snapPosition(event.pointerPosition, true, false);
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
    .plainText(`0${(await OBR.scene.grid.getScale()).parsed.unit}`)
    .position(startPos)
    .layer("NOTE")
    .build();
  interaction = await OBR.interaction.startItemInteraction([label, path]);
}
async function onToolDragMove(context, event) {
  if (interaction) {
    const [update] = interaction;
    let newPos = await OBR.scene.grid.snapPosition(event.pointerPosition, true, false);
    let scale = (await OBR.scene.grid.getScale()).parsed.unit
    let scale_multiplier = (await OBR.scene.grid.getScale()).parsed.multiplier
    if (context.activeMode === `${ID}/move`) {
      if (dragItem) {
        await OBR.scene.items.updateItems([dragItem], (items) => {
          items[0].position = newPos;
        });
      }
    }
    update(([label, path]) => {
      let lastCommand = path.commands[path.commands.length - 1];
      let lastLastCommand = path.commands[path.commands.length - 2];
      if (lastCommand) {
        if (lastCommand[1] === newPos.x && lastCommand[2] === newPos.y) {
          return;
        }
      }
      if (lastLastCommand) {
        if (lastLastCommand[1] === newPos.x && lastLastCommand[2] === newPos.y) {
          path.commands.pop();
          label.position = newPos;
          label.text.plainText = `${scale_multiplier * (path.commands.length - 1)}${scale}`;
          return;
        }
      }
      path.commands.push([Command.LINE, newPos.x, newPos.y])
      label.position = newPos;
      label.text.plainText = `${scale_multiplier * (path.commands.length - 1)}${scale}`;
    });
  }
}

function onToolDragEnd(_, event) {
  if (interaction) {
    const [_, stop] = interaction;
    stop();
  }
  interaction = null;
  dragItem = null;
}

function onToolDragCancel() {
  if (interaction) {
    const [update, stop] = interaction;
    let [label, path] = update(([label, path]) => {
    });
    OBR.scene.items.addItems([label, path]);
    allMyItems.push([label, path]);
    stop();
  }
  interaction = null;
  dragItem = null;
}



OBR.onReady(() => {
  createTool();
  createMode();
  createAction();
});

