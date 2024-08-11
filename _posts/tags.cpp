// ReplaceTags.cpp : 이 파일에는 'main' 함수가 포함됩니다. 거기서 프로그램 실행이 시작되고 종료됩니다.
//


// 개인 블로그 Markdown post 관리를 위한 프로그램
// BamOwl
// using c++17
//place exe file in directory

#include <queue>
#include <string>
#include <sstream>


using namespace std;
namespace fs = std::filesystem;

//Parse directory
string getDirectory(const string s) {
    string d;
    d = s.substr(0, s.find_last_of("/\\"));
    return d;
}

//Read Files in directory
void readDirectory(const string d, vector<string>& v) {
    for (const auto& entry : fs::directory_iterator(d)) {
        if (entry.path().extension() == ".md") {
            string t = entry.path().string();
            string s = t.substr(t.find_last_of("/\\") + 1, t.size());
            v.push_back(s);
        }
    }
}


//Rewrite File

//Replace tags into array form
string replaceTags(string l) {
    string token;
    stringstream ss(l);

    stringstream temp;
    queue<string> q;

    ss >> token;
    temp << token;

    while (ss >> token) {
        if (token.find("[") == 0) {
            return ss.str();
        }
        else {
            q.push(token);
        }
    }

    
    int count = 1;
    int limit = q.size();

    while (!q.empty()) {
        
        if (count == 1) {
            temp << " [" << q.front() + ", ";
            count++;
        }
        else if (count == limit) {
            temp << q.front() << "]";
        }
        else {
            temp << q.front() + ", ";
            count++;
        }
        q.pop();
        
    }

    return temp.str();
}



//Readfile and store in vector
void readFile(vector<string>& l, const string p, const string f) {
    fstream in(p + "\\" + f, std::fstream::in | std::fstream::out);
    string s;
    if (!in) {
        cout << "ERROR READING FILES" << endl;
    }
    else {
        while (getline(in, s)) {
            l.push_back(s);
        }
    }
    
    in.close();
}

void writeFile(vector<string> l, const string p, const string f) {
    fstream out(p + "\\" + f, std::fstream::in | std::fstream::out);
    string s;
    string target = "tags";
    if (!out) {
        cout << "ERROR WRITING FILES" << endl;
    }
    else {
        for (int i = 0; i < l.size(); i++) {
            if(l[i].find(target) == 0) {
                out << replaceTags(l[i]) << endl;
            }
            else {
                out << l[i] << endl;
            }
        }
    }
}

//Main
int main(int argc, char* argv[]) {
    const string path = getDirectory(argv[0]);
    string fileName = "test.md";
    vector<string> lines;
    vector<string> files;

    readDirectory(path, files);
    for (int i = 0; i < files.size(); i++) {
        cout << files[i] << endl;
        lines.clear();
        readFile(lines, path, files[i]);
        writeFile(lines, path, files[i]);
    }

    return 0;
}

// 프로그램 실행: <Ctrl+F5> 또는 [디버그] > [디버깅하지 않고 시작] 메뉴
// 프로그램 디버그: <F5> 키 또는 [디버그] > [디버깅 시작] 메뉴

// 시작을 위한 팁: 
//   1. [솔루션 탐색기] 창을 사용하여 파일을 추가/관리합니다.
//   2. [팀 탐색기] 창을 사용하여 소스 제어에 연결합니다.
//   3. [출력] 창을 사용하여 빌드 출력 및 기타 메시지를 확인합니다.
//   4. [오류 목록] 창을 사용하여 오류를 봅니다.
//   5. [프로젝트] > [새 항목 추가]로 이동하여 새 코드 파일을 만들거나, [프로젝트] > [기존 항목 추가]로 이동하여 기존 코드 파일을 프로젝트에 추가합니다.
//   6. 나중에 이 프로젝트를 다시 열려면 [파일] > [열기] > [프로젝트]로 이동하고 .sln 파일을 선택합니다.
