/*--------------------------------------------------------------------------------
敵再移動 ver 1.2

■作成者
キュウブ

■概要
このスクリプトを導入すると敵も再移動を行うようになります

ロジックとしては以下のようになります
<行動型>
相手から最も遠い位置に移動する（最も消費移動コストの高い場所ではなく最もマス目が離れている場所）

<移動型>
目標地点に向かって移動する

<待機型・カスタム型>
再移動しない

※攻撃、アイテム、杖、盗む、行動回復、鍵開けにのみ対応しています


■更新履歴
ver 1.2 (2024/9/28)
混乱の状態異常時に再移動しなくなるバグを修正

ver 1.1 (2017/8/29)
戦闘中にユニットのステータスや地形が変化した場合を考慮せずに再移動するバグを修正
移動型の場合、目標地点が目の前にないと再移動しないバグを修正

ver 1.0 (2017/8/27)

■対応バージョン
SRPG Studio Version:1.144

■規約
・利用はSRPG Studioを使ったゲームに限ります。
・商用・非商用問いません。フリーです。
・加工等、問題ありません。
・クレジット明記無し　OK (明記する場合は"キュウブ"でお願いします)
・再配布、転載　OK (バグなどがあったら修正できる方はご自身で修正版を配布してもらっても構いません)
・wiki掲載　OK
・SRPG Studio利用規約は遵守してください。

--------------------------------------------------------------------------*/

(function () {
  var tempFunctions = {
    AutoActionBuilder: {
      _pushAttack: AutoActionBuilder._pushAttack,
      _pushItem: AutoActionBuilder._pushItem,
      _pushSkill: AutoActionBuilder._pushSkill
    }
  };

  AutoActionBuilder._pushAttack = function (unit, autoActionArray, combination) {
    tempFunctions.AutoActionBuilder._pushAttack.call(this, unit, autoActionArray, combination);
    this._pushRepeatMove(unit, autoActionArray, combination, UnitCommand.Attack);
  };

  AutoActionBuilder._pushItem = function (unit, autoActionArray, combination) {
    tempFunctions.AutoActionBuilder._pushItem.call(this, unit, autoActionArray, combination);

    if (combination.item) {
      if (combination.item.isWand()) {
        this._pushRepeatMove(unit, autoActionArray, combination, UnitCommand.Wand);
      } else {
        this._pushRepeatMove(unit, autoActionArray, combination, UnitCommand.Item);
      }
    }
  };

  AutoActionBuilder._pushSkill = function (unit, autoActionArray, combination) {
    tempFunctions.AutoActionBuilder._pushSkill.call(this, unit, autoActionArray, combination);
    if (combination.skill) {
      if (combination.skill.getSkillType() === SkillType.STEAL) {
        this._pushRepeatMove(unit, autoActionArray, combination, UnitCommand.Steal);
      } else if (combination.skill.getSkillType() === SkillType.QUICK) {
        this._pushRepeatMove(unit, autoActionArray, combination, UnitCommand.Quick);
      } else if (combination.skill.getSkillType() === SkillType.PICKING) {
        this._pushRepeatMove(unit, autoActionArray, combination, UnitCommand.Treasure);
      } else if (combination.skill.getSkillType() === SkillType.CUSTOM) {
        // カスタムスキルで再移動を適用したい場合はここをいい感じに設定する事
      }
    }
  };
})();

// 再移動AIクラス RepeatMoveAutoAction では enterAutoAction (再移動を開始しようとした時点)で移動経路の算出を行う
// これは再移動開始直前までに地形やユニットの状態が変化する事を考慮したとき、事前に移動経路を求めておく事が不可能なためである
var RepeatMoveAutoAction = defineObject(MoveAutoAction, {
  _firstCombination: null,
  _secondCombination: null,
  _command: null,

  setAutoActionInfo: function (unit, firstCombination, command) {
    this._unit = unit;
    this._firstCombination = firstCombination;
    this._command = command;
    this._simulateMove = createObject(SimulateMove);
  },

  enterAutoAction: function () {
    var aliveState = this._unit.getAliveState();

    // 死亡/負傷状態(再移動前に倒されている)の場合は再移動しない
    if (aliveState === AliveType.DEATH || aliveState === AliveType.INJURY) {
      return EnterResult.NOTENTER;
    }

    // 再移動が許可されてないか、動く事ができない状態なら移動しない
    if (this._isRepeatMovable() === false || this._isTargetMovable() === false) {
      return EnterResult.NOTENTER;
    }

    // 再移動の経路を求める
    this._createSecondCombination();

    // 経路が無い場合は移動しない
    if (this._secondCombination === null) {
      return EnterResult.NOTENTER;
    }

    this._moveCource = this._secondCombination.cource;

    return MoveAutoAction.enterAutoAction.call(this);
  },

  _isRepeatMovable: function () {
    var patternType, targetUnitPos;

    if (this._command.isRepeatMoveAllowed() === false) {
      return false;
    }

    if (this._unit.getClass().getClassOption() & ClassOptionFlag.REPEATMOVE) {
      return true;
    }

    if (SkillControl.getPossessionSkill(this._unit, SkillType.REPEATMOVE) !== null) {
      return true;
    }

    return false;
  },

  _isTargetMovable: function () {
    if (StateControl.isBadStateOption(this._unit, BadStateOption.NOACTION)) {
      return false;
    }

    return this._firstCombination.movePoint !== ParamBonus.getMov(this._unit);
  },

  _createSecondCombination: function () {
    var patternType = this._unit.getAIPattern().getPatternType();
    var targetUnitPos;

    if (patternType === PatternType.APPROACH) {
      if (this._firstCombination.targetUnit) {
        targetUnitPos = {
          x: this._firstCombination.targetUnit.getMapX(),
          y: this._firstCombination.targetUnit.getMapY()
        };
        this._secondCombination = CombinationManager.getEscapeMoveCombination(
          this._unit,
          targetUnitPos,
          this._firstCombination
        );
      } else {
        this._secondCombination = CombinationManager.getEscapeMoveCombination(
          this._unit,
          firstCombination.targetPos,
          this._firstCombination
        );
      }
    } else if (patternType === PatternType.WAIT) {
      // 待機型は再移動しない、させたい場合はここを編集する事
    } else if (patternType === PatternType.MOVE) {
      this._secondCombination = CombinationManager.getAdvanceMoveCombination(this._unit, this._firstCombination);
    } else if (patternType === PatternType.CUSTOM) {
      // カスタム型は再移動しない、させたい場合はここを編集する事
    } else {
      // 今後のアップデートで別の型が追加される事があったらここを編集する事
    }
  }
});

AutoActionBuilder._pushRepeatMove = function (unit, autoActionArray, firstCombination, command) {
  var autoAction;
  autoAction = createObject(RepeatMoveAutoAction);
  autoAction.setAutoActionInfo(unit, firstCombination, command);
  autoActionArray.push(autoAction);
};

// 再移動時に対象ユニットから最も遠いマスに移動するためのコースを計算する
// 第2, 3引数は統合しても良いが、他機能でも使えるかもしれないと思ってあえて分けてる
CombinationManager.getEscapeMoveCombination = function (unit, targetPos, firstCombination) {
  var secondCombination, misc, searchPosX, searchPosY, different;
  var firstCombinationX = CurrentMap.getX(firstCombination.posIndex);
  var firstCombinationY = CurrentMap.getY(firstCombination.posIndex);
  var currentX = unit.getMapX();
  var currentY = unit.getMapY();
  var goal = {
    index: firstCombination.posIndex,
    different: 0
  };

  misc = CombinationBuilder.createMisc(unit, root.getCurrentSession().createMapSimulator());

  unit.setMapX(firstCombinationX);
  unit.setMapY(firstCombinationY);

  misc.simulator.startSimulation(unit, ParamBonus.getMov(unit) - firstCombination.movePoint);
  misc.indexArray = misc.simulator.getSimulationIndexArray();

  // 対象から最も遠いマス（消費移動コストではなくマス）を選択する
  for (var index = 0; index < misc.indexArray.length; index++) {
    searchPosX = CurrentMap.getX(misc.indexArray[index]);
    searchPosY = CurrentMap.getY(misc.indexArray[index]);
    different = Math.abs(searchPosX - targetPos.x) + Math.abs(searchPosY - targetPos.y);

    if (goal.different < different) {
      goal.index = misc.indexArray[index];
      goal.different = different;
    }
  }

  secondCombination = StructureBuilder.buildCombination();
  secondCombination.cource = CourceBuilder.createExtendCource(unit, goal.index, misc.simulator);

  unit.setMapX(currentX);
  unit.setMapY(currentY);

  return secondCombination;
};

// 再移動時にさらに目標地点に前進するための経路を洗い出す
CombinationManager.getAdvanceMoveCombination = function (unit, firstCombination) {
  var secondCombination, targetUnit, targetX, targetY, data, goalIndex;
  var firstCombinationX = CurrentMap.getX(firstCombination.posIndex);
  var firstCombinationY = CurrentMap.getY(firstCombination.posIndex);
  var currentX = unit.getMapX();
  var currentY = unit.getMapY();
  var patternInfo = unit.getAIPattern().getMovePatternInfo();
  var moveAIType = patternInfo.getMoveGoalType();

  if (moveAIType === MoveGoalType.POS) {
    targetX = patternInfo.getMoveGoalX();
    targetY = patternInfo.getMoveGoalY();
  } else {
    // 対象ユニットがいない場合は行動型と同じくその場の敵から離れるような挙動を行う
    targetUnit = patternInfo.getMoveGoalUnit();
    if (targetUnit === null) {
      return this.getEscapeMoveCombination(unit, combination.targetUnit, combination);
    }

    targetX = targetUnit.getMapX();
    targetY = targetUnit.getMapY();
  }

  goalIndex = CurrentMap.getIndex(targetX, targetY);
  misc = CombinationBuilder.createMisc(unit, root.getCurrentSession().createMapSimulator());

  unit.setMapX(firstCombinationX);
  unit.setMapY(firstCombinationY);

  misc.simulator.startSimulation(unit, ParamBonus.getMov(unit) - firstCombination.movePoint);
  misc.indexArray = misc.simulator.getSimulationIndexArray();

  secondCombination = StructureBuilder.buildCombination();
  secondCombination.cource = CourceBuilder.createExtendCource(unit, goalIndex, misc.simulator);

  if (secondCombination.cource.length === 0) {
    data = CourceBuilder.getValidGoalIndex(unit, goalIndex, misc.simulator, moveAIType);
    if (goalIndex !== data.goalIndex) {
      secondCombination.cource = CourceBuilder.createExtendCource(unit, data.goalIndex, misc.simulator);
    }
  }

  unit.setMapX(currentX);
  unit.setMapY(currentY);

  return secondCombination;
};
