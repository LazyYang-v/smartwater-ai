package com.smartwater;
public class ApiFailure extends RuntimeException {
 public final int status; public final String code;
 public ApiFailure(int status,String code,String message){super(message);this.status=status;this.code=code;}
 public static ApiFailure bad(String code,String message){return new ApiFailure(400,code,message);}
}
