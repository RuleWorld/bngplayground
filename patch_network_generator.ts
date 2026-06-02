import * as fs from 'fs';

const filePath = 'packages/engine/src/services/graph/NetworkGenerator.ts';
let code = fs.readFileSync(filePath, 'utf8');

// target 1
const target1 = `              const reactantComp = reactantMol.components.find(c => c.name === prodComp.name);`;
const replacement1 = `              // ⚡ Bolt: replace array .find in inner loop
              let reactantComp: typeof reactantMol.components[0] | undefined;
              for (let i = 0; i < reactantMol.components.length; i++) {
                if (reactantMol.components[i].name === prodComp.name) {
                  reactantComp = reactantMol.components[i];
                  break;
                }
              }`;

// target 2
const target2 = `            const targetComp = targetMol.components.find(c => c.name === prodComp.name);`;
const replacement2 = `            // ⚡ Bolt: replace array .find in inner loop
            let targetComp: typeof targetMol.components[0] | undefined;
            for (let i = 0; i < targetMol.components.length; i++) {
              if (targetMol.components[i].name === prodComp.name) {
                targetComp = targetMol.components[i];
                break;
              }
            }`;

// target 3
const target3 = `                    const compToUpdate = newMol.components.find(c => c.name === delta.comp);`;
const replacement3 = `                    // ⚡ Bolt: replace array .find in inner loop
                    let compToUpdate: typeof newMol.components[0] | undefined;
                    for (let i = 0; i < newMol.components.length; i++) {
                      if (newMol.components[i].name === delta.comp) {
                        compToUpdate = newMol.components[i];
                        break;
                      }
                    }`;

// target 4
const target4 = `                      const rComp4 = rPatMol4.components.find(c => c.name === pComp.name);`;
const replacement4 = `                      // ⚡ Bolt: replace array .find in inner loop
                      let rComp4: typeof rPatMol4.components[0] | undefined;
                      for (let i = 0; i < rPatMol4.components.length; i++) {
                        if (rPatMol4.components[i].name === pComp.name) {
                          rComp4 = rPatMol4.components[i];
                          break;
                        }
                      }`;

let patched = false;
if (code.includes(target1)) {
    code = code.replace(target1, replacement1);
    patched = true;
} else {
    console.log('Target 1 not found!');
}

if (code.includes(target2)) {
    code = code.replace(target2, replacement2);
    patched = true;
} else {
    console.log('Target 2 not found!');
}

if (code.includes(target3)) {
    code = code.replace(target3, replacement3);
    patched = true;
} else {
    console.log('Target 3 not found!');
}

if (code.includes(target4)) {
    code = code.replace(target4, replacement4);
    patched = true;
} else {
    console.log('Target 4 not found!');
}

if (patched) {
  fs.writeFileSync(filePath, code);
  console.log('Patched NetworkGenerator.ts!');
}
