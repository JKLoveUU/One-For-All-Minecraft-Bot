# 兌換功能

---

### set

基於展示框 自動設定盒子輸入輸出座標

/m bot ce auto

if exist sign
```
[auto]              #牌子L1 
exchange            #牌子L2 <模式>
33                  #牌子L3 <id>
args                #牌子L4 <參數>
```
it will auto execute the exchange command

---
### exchange

/m bot ce e <`id`> <`args`>

args:

    -t      tree mode

id is the index(0-53) in /shop_item or /shop_tree