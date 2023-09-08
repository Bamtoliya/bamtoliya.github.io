---
layout: post
title:  Computer Graphics#2
date:   2023-02-01
category: study
tag: game, dev, portfolio, 포트폴리오, Academy, 학교, 수업
---


---

# Computer Grpahics

---

- Language: C++
- Tool: Visual Studio
- 핵심개념: Ray Tracing, Multi Threading
- 
---

기본적으로는 [.ray](https://paulbourke.net/dataformats/rayshade/) 파일을 읽고
주어진 데이터대로 렌더링 할수 있는지를 본다.

솔직히 말해 이 과제는 제 시간에 완성할수 없었다.
능력부족이라 생각한다.


#1 과제에서 색은 고정하고, 반사와 그림자를 추가해서 더욱 사실적인 

[멀티 쓰레딩](CS/C++.md)을 통해 처리속도를 높일수 있다.

C++ 에선 semaphhore 와 thread 를 사용할 수 있다.

앞선 레이트레이싱 과정에서 

반사와 그림자 그리고 광선의 충돌횟수를 증가시켜, 음영을 추가한다.

Blinn Phong Shading 기법과

Diffuse, Ambient, Reflection, Shadow를 색상정보에 더해 저장한다.

자세한 수식은

~~~cpp
Lighting GetPointLight(PointLight light, float3 pos3D, float3 viewDir, float3 normal)
{
	Lighting OUT;
	if (light.diffusePower > 0)
	{
		float3 lightDir = light.position - pos3D; //3D position in space of the surface
		float distance = length(lightDir);
		lightDir = lightDir / distance; // = normalize(lightDir);
		distance = distance * distance; //This line may be optimised using Inverse square root

		//Intensity of the diffuse light. Saturate to keep within the 0-1 range.
		float NdotL = dot(normal, lightDir);
		float intensity = saturate(NdotL);

		// Calculate the diffuse light factoring in light color, power and the attenuation
		OUT.Diffuse = intensity * light.diffuseColor * light.diffusePower / distance;

		//Calculate the half vector between the light vector and the view vector.
		//This is typically slower than calculating the actual reflection vector
		// due to the normalize function's reciprocal square root
		float3 H = normalize(lightDir + viewDir);

		//Intensity of the specular light
		float NdotH = dot(normal, H);
		intensity = pow(saturate(NdotH), specularHardness);

		//Sum up the specular light factoring
		OUT.Specular = intensity * light.specularColor * light.specularPower / distance; 
	}
	return OUT;
}
~~~
from [wikipedia.org](https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_reflection_model)




---

---