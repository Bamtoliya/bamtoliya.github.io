---
layout: post
title:  Computer Graphics#1
date:   2023-02-01
category: study
tag: game, dev, portfolio, 포트폴리오, Academy, 학교, 수업
---


---

# Computer Grpahics(Ray Tracing)

---

- Language: C++
- Tool: Visual Studio
- 핵심 개념: Ray Tracing

---

기본적으로는 [.ray](https://paulbourke.net/dataformats/rayshade/) 파일을 읽고
주어진 데이터대로 렌더링 할수 있는지를 본다.

카메라의 위치

반사와 그림자는 고려하지않고, 색만을 정확하게 트레이싱할수 있는지 보는 과제이다.

ray 파일에는 환경과, 오브젝트의 위치와 색의 정보가 쓰여져있으며,
그것을 읽고, 레이트레이싱 기법으로 픽셀에 반영될 색정보를 저장해
렌더링하고 [PPM](https://paulbourke.net/dataformats/ppm/#:~:text=A%20PPM%20file%20consists%20of,including%20the%20double%20quotes!)포맷의 파일로 저장한다.

빛줄기를 따라가서 물체에 맞았다면, 물체의 색깔을 저장하고 아니라면 배경색을 저장한다.


1. 파일을 읽어 정보를 구조에 저장하기
2. 구조에서 정보를 토대로, 카메라의 위치,각도, 그리고 해상도를 반영한다.
3. 카메라와 해상도의 정보를 토대로 광선을 만들어 오브젝트와 충돌을 확인한다.
4. 충돌했다면 물체의 색, 아니라면 배경의 색을 저장한다.
5. 충돌한 기록이있지만 또 충돌했다면 두 물체와 카메라간의 거리를 계산하여 가장 가까운 색만 저장한다.
6. 모든 픽셀에대해 색을 저장했다면 파일에 색정보를 쓴다.

해상도의 넓이를 X, 높이를 Y 라고하자
파일안에 있는 오브젝트의 갯수를 N

이 경우 예상 시간은 O(X*Y*N)이 된다.
시간을 줄이기위해선 자료구조의 변경과 함수를 재귀구조로 바꾸거나 멀티쓰레드 방법을 사용할 수 있다.

충돌을 확인하는 방법은
구체일떄와, 삼각형, 그리고 다각형일때가 다른데

이번 과제에서는 구체의 경우만 처리한다.

구체와 빛의 충돌을 확인하기위해서 빛의 방향과 구체의 영역이 겹친다면 구체의색을 리턴한다.
그중 가장 가까운 거리에있는 물체만을 반사하기위해서 물체와 광선이 겹친 점을 계산하여 저장한다.
같은 광선에 다른 물체와 겹쳤다면 저장한 값과 비교하여 가까운 거리에 있는 색만 저장한다.

구체의 경우, 

~~~cpp
float Sphere::intersection(Ray r) {

    //
    Vector3D distance = r.e - center;

    float a = dot(r.d, r.d);
    float b = 2.0 * dot(distance, r.d);
    float c = dot(distance, distance) - radius * radius;

    float discriminant = b * b - 4 * a * c;

    float root1 = -b + sqrt(discriminant) / (2 * a);
    float root2 = -b - sqrt(discriminant) / (2 * a);

    float t = root1;

    if (root1 < 0 || (root2 > 0 && root2 < root1)) {
        t = root2;
    }

    return t;
}
~~~

<img class="img" src="../../assets/img/dev/trace1.png">


---

---