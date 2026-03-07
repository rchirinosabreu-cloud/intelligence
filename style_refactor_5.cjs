const fs = require('fs');
const path = require('path');

const dir = 'src/components/modules/Minutes';

const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  content = content.replace(/bg-indigo-500\/10/g, 'bg-primary/10');
  content = content.replace(/bg-indigo-900\/50 hover:bg-indigo-800\/50 text-indigo-100 border border-indigo-500\/30/g, 'bg-primary/20 hover:bg-primary/30 text-primary-foreground border border-primary/30');
  content = content.replace(/bg-indigo-950\/40 border border-indigo-800\/40/g, 'bg-background/50 backdrop-blur-xl border border-border/50');

  // AudioUpload
  content = content.replace(/border-indigo-500 bg-indigo-500\/10/g, 'border-primary bg-primary/10');
  content = content.replace(/border-indigo-900\/30/g, 'border-border/50');
  content = content.replace(/hover:border-indigo-500\/50/g, 'hover:border-primary/50');
  content = content.replace(/bg-indigo-900\/30 border-indigo-500 shadow-lg shadow-indigo-500\/20/g, 'bg-primary/20 border-primary shadow-lg shadow-primary/20');

  // CompleteAnalysis
  content = content.replace(/text-indigo-400/g, 'text-primary');

  fs.writeFileSync(filePath, content);
});

console.log("Refactored more styles");
