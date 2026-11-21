export const experiment='91-safe-command-newline',seed='safe-command-newline-v1',holdoutSeed='safe-command-newline-holdout-v1';
const hazards=[
 ['lf','echo SAFE\nlab_effect'], ['double-lf','echo SAFE\n\nlab_effect'],
 ['lf-tab','echo SAFE\n\tlab_effect'], ['crlf','echo SAFE\r\nlab_effect'],
 ['comment','echo SAFE # comment\nlab_effect'],
 ['continuation-then-separator','echo SAFE\\\ncontinued\nlab_effect'],
 ['pwd','pwd\nlab_effect'], ['whoami','whoami\nlab_effect'],
];
const controls=[
 ['plain','echo SAFE',true,false], ['horizontal',' \techo SAFE\t ',true,false],
 ['tab','echo\tSAFE',true,false], ['outer-lf','\necho SAFE\n',true,false],
 ['literal-backslash-n',"echo 'SAFE\\nSAFE'",true,false],
 ['quoted-lf',"echo 'SAFE\nSAFE'",false,false],
 ['escaped-lf','echo SAFE\\\ncontinued',false,false],
 ['semicolon','echo SAFE; lab_effect',false,true],
 ['and','echo SAFE && lab_effect',false,true], ['empty','',false,false],
 ['not-allowlisted','lab_effect',false,true], ['word-boundary','catastrophe',false,false],
];
export const scenarios=[...hazards.map(([id,command])=>({id,kind:'hazard',command,expectedSafe:false,expectedEffect:true,pairedCommand:`${command.startsWith('echo')?'echo SAFE':command.split('\n')[0]}; lab_effect`})),...controls.map(([id,command,expectedSafe,expectedEffect])=>({id,kind:'control',command,expectedSafe,expectedEffect}))];
export const thresholds={hazardRejectionAccuracy:1,falseSafeRate:0,controlAccuracy:1,separatorControlAccuracy:1,shellGroundTruthAccuracy:1,ownershipAccuracy:1,recoveryAccuracy:1,scenarioAccuracy:1,infrastructureFailures:0};
