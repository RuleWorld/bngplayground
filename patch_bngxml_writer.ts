import * as fs from 'fs';

const filePath = 'packages/engine/src/services/simulation/BNGXMLWriter.ts';
let code = fs.readFileSync(filePath, 'utf8');

const target = `          const partner = partners
            .map((partnerKey) => {
              const [pMolStr, pCompStr] = partnerKey.split('.');
              return { molIdx: Number(pMolStr), compIdx: Number(pCompStr) };
            })
            .find(({ molIdx: pMol, compIdx: pComp }) => {
              const partnerComp = graph.molecules[pMol]?.components[pComp];
              return Boolean(partnerComp?.edges.has(label));
            });`;

const replacement = `          // ⚡ Bolt: Eliminate multi-pass allocation (.map().find()) and .split()
          let partner: { molIdx: number, compIdx: number } | undefined;
          for (let i = 0; i < partners.length; i++) {
            const partnerKey = partners[i];
            const dotIdx = partnerKey.indexOf('.');
            const pMol = Number(partnerKey.substring(0, dotIdx));
            const pComp = Number(partnerKey.substring(dotIdx + 1));
            const partnerComp = graph.molecules[pMol]?.components[pComp];
            if (partnerComp && partnerComp.edges.has(label)) {
              partner = { molIdx: pMol, compIdx: pComp };
              break;
            }
          }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync(filePath, code);
    console.log('Patched!');
} else {
    console.log('Target not found!');
}
