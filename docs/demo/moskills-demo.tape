# Records docs/demo/moskills-demo.gif from a real moskills session.
# Re-record (needs vhs, ttyd, ffmpeg and moskills on PATH), from the repo root:
#   vhs docs/demo/moskills-demo.tape
Output docs/demo/moskills-demo.gif

Require moskills
Require git
Require node

Set Shell bash
Set FontSize 15
Set Width 1180
Set Height 680
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 30ms

Hide
Type "export DEMO_SRC=$PWD/docs/demo/fixture PS1='$ ' && cd $(mktemp -d) && git init -q && git config user.email demo@example.com && git config user.name demo && cp $DEMO_SRC/* . && clear" Enter
Sleep 500ms
Show

Type "# A discount rule, and the test that proves it" Enter
Type "cat price.js" Enter
Sleep 1.2s
Type "moskills init" Enter
Sleep 1.5s
Type "moskills run-state init --id discount --goal '10% off orders over 100' --scope price.js,price.test.js --tasks calc" Enter
Sleep 1.5s
Type "# The agent records its check through moskills: exit code + file hashes" Enter
Type "moskills run-state wrap --id discount --task task-1 --check unit --files price.js,price.test.js --auto-complete -- node --test | tail -3" Enter
Sleep 2.5s
Type "moskills run-state accept --id discount --by you" Enter
Sleep 1.2s
Type "clear && moskills run-state done --id discount" Enter
Sleep 4s

Type "clear" Enter
Type "# Someone edits the code after the test ran..." Enter
Type "sed -i 's/0.9/0.8/' price.js" Enter
Sleep 800ms
Type `moskills run-state done --id discount; echo "exit=$?"` Enter
Sleep 5s
Type "git add -A && git commit -m 'ship discount'" Enter
Sleep 5s
