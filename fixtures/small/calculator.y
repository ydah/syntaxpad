%{
#include <stdio.h>
static const char *marker = "%%";
%}

%token <number> NUMBER
%token IDENT
%left '+' '-'
%type <number> input expression term
%start input
%mystery keep_this_verbatim

%%

input:
    expression { $$ = $1; }
  ;

expression:
    term
  | expression[left] '+' term[right] { $$ = $left + $[right]; @$ = @1; }
  | expression '-' term { $$ = $1 - $3; }
  ;

term:
    NUMBER
  | IDENT
  ;

unused:
    NUMBER
  ;

%%

int main(void) {
  return 0;
}
