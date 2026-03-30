const fs = require('fs');
const path = require('path');

const dir = 'src/components/modules/Minutes';

const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Text Colors
  content = content.replace(/text-purple-[0-9]+/g, 'text-muted-foreground');
  content = content.replace(/text-indigo-[0-9]+/g, 'text-muted-foreground');
  content = content.replace(/text-pink-[0-9]+/g, 'text-muted-foreground');
  content = content.replace(/text-violet-[0-9]+/g, 'text-muted-foreground');

  // Borders
  content = content.replace(/border-purple-[0-9]+\/[0-9]+/g, 'border-border');
  content = content.replace(/border-indigo-[0-9]+\/[0-9]+/g, 'border-border');
  content = content.replace(/border-pink-[0-9]+\/[0-9]+/g, 'border-border');
  content = content.replace(/border-violet-[0-9]+\/[0-9]+/g, 'border-border');
  content = content.replace(/border-primary\/30/g, 'border-border');

  // Remove random bg-purple or bg-indigo that might be left
  content = content.replace(/bg-purple-[0-9]+\/[0-9]+/g, 'bg-muted/50');
  content = content.replace(/bg-indigo-[0-9]+\/[0-9]+/g, 'bg-muted/50');

  // Specific dashed border fixes for AudioUpload and DocumentUpload
  content = content.replace(/border-dashed border-border/g, 'border-dashed border-zinc-300 dark:border-zinc-700');
  content = content.replace(/border-2 border-dashed border-zinc-[0-9]+/g, 'border-2 border-dashed border-zinc-300 dark:border-zinc-700');

  fs.writeFileSync(filePath, content);
});

console.log("Colors and Borders Refactored");
