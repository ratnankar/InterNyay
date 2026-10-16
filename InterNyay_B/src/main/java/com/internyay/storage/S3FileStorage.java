package com.internyay.storage;

import com.internyay.exception.StorageException;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.InputStream;
import java.net.URI;
import java.util.NoSuchElementException;

// Keeps files in a private S3 compatible bucket (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO ...).
// Files are never public: the backend checks the user and streams the file itself
@Slf4j
@Service
@ConditionalOnProperty(name = "internyay.storage.type", havingValue = "s3")
public class S3FileStorage implements FileStorage {

    private final S3Client s3;
    private final String bucket;

    public S3FileStorage(
            @Value("${internyay.storage.s3.bucket:}") String bucket,
            @Value("${internyay.storage.s3.region:us-east-1}") String region,
            @Value("${internyay.storage.s3.endpoint:}") String endpoint,
            @Value("${internyay.storage.s3.access-key:}") String accessKey,
            @Value("${internyay.storage.s3.secret-key:}") String secretKey,
            @Value("${internyay.storage.s3.path-style:false}") boolean pathStyle) {

        if (bucket == null || bucket.isBlank()) {
            throw new IllegalStateException("S3_BUCKET is required when STORAGE_TYPE=s3");
        }

        S3ClientBuilder builder = S3Client.builder()
                .region(Region.of(region))
                .forcePathStyle(pathStyle);

        // Only for non-AWS providers (R2, Spaces, MinIO ...)
        if (endpoint != null && !endpoint.isBlank()) {
            builder.endpointOverride(URI.create(endpoint));
        }

        // Without keys the AWS default chain is used (environment, instance role ...)
        if (accessKey != null && !accessKey.isBlank()) {
            builder.credentialsProvider(StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(accessKey, secretKey)));
        }

        this.s3 = builder.build();
        this.bucket = bucket;
        log.info("File storage: S3 bucket {}", bucket);
    }

    @PreDestroy
    void close() {
        s3.close();
    }

    @Override
    public void put(String key, InputStream data, long sizeBytes, String contentType) {
        try {
            PutObjectRequest.Builder req = PutObjectRequest.builder().bucket(bucket).key(key);
            if (contentType != null && !contentType.isBlank()) {
                req.contentType(contentType);
            }
            s3.putObject(req.build(), RequestBody.fromInputStream(data, sizeBytes));
        } catch (SdkException e) {
            throw new StorageException("Could not save the file", e);
        }
    }

    @Override
    public InputStream open(String key) {
        try {
            return s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (NoSuchKeyException e) {
            throw new NoSuchElementException("Stored file not found");
        } catch (SdkException e) {
            throw new StorageException("Could not read the file", e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (SdkException e) {
            log.warn("Could not delete stored file {}: {}", key, e.getMessage());
        }
    }
}
