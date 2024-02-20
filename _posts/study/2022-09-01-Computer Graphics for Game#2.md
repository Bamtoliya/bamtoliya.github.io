---
layout: post
title:  Computer Graphics for Game#2
date:   2022-09-01
category: study
tags: dev portfolio 포트폴리오 Academy 학교 수업
---


![Alt text](<../../assets/img/portfolio/maze seed3.jpg>)


언리얼 엔진의 액터를 생성하는법

---

- Language: C++
- Tool: Visual Studio, Unreal Engine

---

랜덤 시드를 배정받아 미로를 만들어내는 과제였다.

한종류 메쉬를 언리얼 엔진에서 입력받아
Recursive Backtracking 알고리즘으로 미로를 생성한다.

> [Recursive Backtracking](https://weblog.jamisbuck.org/2010/12/27/maze-generation-recursive-backtracking):
    1. 출발점을 정한다.
    2. 랜덤한 벽을 하나 정하고, 방문하지 않은 인접한 셀을 방문한다. 셀을 업데이트한다.
    3. 모든 인접한 셀을 방문했다면 방문하지 않은 셀이 있는 벽으로 돌아간다.
    4. 알고리즘은 출발점으로 돌아갔을때 끝난다.


---

 - 과제를 할떄 문제였던 점: 출구와 입구는 무조건 하나! 여야하는데 알고리즘을 그대로 작성하니 외부 벽이 제대로 형성되지 않았던 것.

---



---