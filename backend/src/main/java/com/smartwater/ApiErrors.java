package com.smartwater;
import java.util.*;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.security.access.AccessDeniedException;
@RestControllerAdvice
public class ApiErrors {
 @ExceptionHandler(ApiFailure.class) ResponseEntity<?> business(ApiFailure e){return error(e.status,e.code,e.getMessage());}
 @ExceptionHandler({MethodArgumentNotValidException.class,HttpMessageNotReadableException.class,MethodArgumentTypeMismatchException.class,MissingRequestHeaderException.class}) ResponseEntity<?> invalid(Exception e){return error(400,"INVALID_REQUEST","请求字段、参数、类型或必填项不符合接口要求");}
 @ExceptionHandler(AccessDeniedException.class) ResponseEntity<?> denied(){return error(403,"FORBIDDEN","该角色无此操作权限");}
 @ExceptionHandler(Exception.class) ResponseEntity<?> failure(Exception e){String id=UUID.randomUUID().toString();LoggerFactory.getLogger(ApiErrors.class).error("Business request failed: {} / {}",id,e.getClass().getSimpleName());return error(500,"INTERNAL_ERROR","服务端处理失败，关联号 "+id);}
 private ResponseEntity<?> error(int status,String code,String message){return ResponseEntity.status(status).body(Map.of("error",Map.of("code",code,"message",message)));}
}
