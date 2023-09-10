---
title: home
layout: default
---

<section class="banner">
    <div class="banner-box1">
        <a href="https://twitch.tv/bamtoliya">
            <img src="assets\img\Twitch_Purple_RGB.gif" />
        </a>
    </div><!---Twitch banner and link-->
    <div class="banner-box2">
        <a href="https://www.youtube.com/channel/UCxLKxVXG1lG3YLZTctRybng">
            <img src="assets\img\Youtube-Banner.gif" />
        </a>
    </div><!---Youtube banner and link-->

    


    
</section>



<section><!--Post Section-->
Lastest Posts

<ul style="list-style:none;">
{% for post in site.posts limit: 10 %}
{% if post.category != empty %}
    <li>
        <h3>
        <a style="text-decoration:none; color: black;" href="{{post.category}}">{{post.category}} ▶</a> 
        <a href="{{ post.url }}">{{ post.title }}</a><span class="date">{{post.date |  date: "%m/%d/%Y"}}</span></h3>      
    </li>
{% endif %}
{% endfor %}
</ul>

</section>