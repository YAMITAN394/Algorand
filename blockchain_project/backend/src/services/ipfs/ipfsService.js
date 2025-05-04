const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class IPFSService {
  constructor() {
    this.client = null;
    this.gateway = null;
    this.initialized = false;
    this.mockMode = false;
  }

  /**
   * Initialize the IPFS service
   */
  async initialize() {
    try {
      // Set gateway URL
      this.gateway = process.env.IPFS_GATEWAY_URL || 'http://localhost:8080';

      try {
        // Try to import ipfs-http-client dynamically
        const { create } = await import('ipfs-http-client');
        
        // Connect to IPFS node
        this.client = create({
          url: process.env.IPFS_API_URL || 'http://localhost:5001',
        });

        // Test connection
        const { id } = await this.client.id();
        logger.info(`Connected to IPFS node: ${id}`);
        
        this.initialized = true;
      } catch (error) {
        logger.warn('IPFS client not available, using mock mode:', error.message);
        this.mockMode = true;
        this.initialized = true;
      }
    } catch (error) {
      logger.error('Failed to initialize IPFS service:', error);
      this.mockMode = true;
      this.initialized = true;
    }
  }

  /**
   * Ensure the service is initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('IPFS service not initialized');
    }
  }

  /**
   * Add a file to IPFS
   * @param {string|Buffer} content - File content or path to file
   * @param {string} fileName - Name of the file (optional)
   * @returns {Promise<Object>} IPFS file info
   */
  async addFile(content, fileName = '') {
    this.ensureInitialized();

    try {
      let fileContent;

      // If content is a string path, read the file
      if (typeof content === 'string' && fs.existsSync(content)) {
        fileContent = fs.readFileSync(content);
        fileName = fileName || path.basename(content);
      } else if (Buffer.isBuffer(content)) {
        fileContent = content;
      } else if (typeof content === 'string') {
        fileContent = Buffer.from(content);
      } else {
        throw new Error('Invalid content type');
      }

      // If in mock mode, generate a fake CID
      if (this.mockMode) {
        const hash = await this.calculateFileHash(fileContent);
        const mockCid = `mock-${hash.substring(0, 16)}`;
        logger.info(`Mock mode: File would be added to IPFS with CID: ${mockCid}`);
        
        return {
          cid: mockCid,
          path: fileName ? `${mockCid}/${fileName}` : mockCid,
          size: fileContent.length,
          url: `${this.gateway}/ipfs/${mockCid}${fileName ? '/' + fileName : ''}`,
          ipfsUri: `ipfs://${mockCid}${fileName ? '/' + fileName : ''}`,
        };
      }

      // Add file to IPFS
      const result = await this.client.add({
        path: fileName,
        content: fileContent,
      });

      logger.info(`File added to IPFS: ${result.path}`);

      return {
        cid: result.cid.toString(),
        path: result.path,
        size: result.size,
        url: `${this.gateway}/ipfs/${result.path}`,
        ipfsUri: `ipfs://${result.path}`,
      };
    } catch (error) {
      logger.error('Error adding file to IPFS:', error);
      throw error;
    }
  }

  /**
   * Add a directory to IPFS
   * @param {string} dirPath - Path to directory
   * @returns {Promise<Object>} IPFS directory info
   */
  async addDirectory(dirPath) {
    this.ensureInitialized();

    try {
      // Check if directory exists
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      // If in mock mode, generate a fake CID
      if (this.mockMode) {
        // Get all files in the directory
        const getAllFiles = (dir) => {
          let results = [];
          const list = fs.readdirSync(dir);
          
          list.forEach((file) => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat && stat.isDirectory()) {
              results = results.concat(getAllFiles(filePath));
            } else {
              results.push(filePath);
            }
          });
          
          return results;
        };
        
        const files = getAllFiles(dirPath);
        const dirHash = crypto.createHash('sha256').update(dirPath).digest('hex');
        const mockCid = `mock-dir-${dirHash.substring(0, 16)}`;
        
        const mockResults = files.map(file => {
          const relativePath = path.relative(dirPath, file);
          const fileContent = fs.readFileSync(file);
          const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
          const fileCid = `mock-${fileHash.substring(0, 16)}`;
          
          return {
            cid: fileCid,
            path: relativePath,
            size: fileContent.length,
          };
        });
        
        logger.info(`Mock mode: Directory would be added to IPFS with CID: ${mockCid}`);
        
        return {
          cid: mockCid,
          path: path.basename(dirPath),
          size: mockResults.reduce((sum, file) => sum + file.size, 0),
          url: `${this.gateway}/ipfs/${mockCid}`,
          ipfsUri: `ipfs://${mockCid}`,
          files: mockResults,
        };
      }

      // Create a glob pattern for all files in the directory
      const globSource = require('ipfs-http-client').globSource;
      const files = globSource(dirPath, '**/*');

      // Add directory to IPFS
      const results = [];
      for await (const result of this.client.addAll(files)) {
        results.push(result);
      }

      // Get the root directory result (last item)
      const rootDir = results[results.length - 1];

      logger.info(`Directory added to IPFS: ${rootDir.path}`);

      return {
        cid: rootDir.cid.toString(),
        path: rootDir.path,
        size: rootDir.size,
        url: `${this.gateway}/ipfs/${rootDir.cid}`,
        ipfsUri: `ipfs://${rootDir.cid}`,
        files: results.map(file => ({
          cid: file.cid.toString(),
          path: file.path,
          size: file.size,
        })),
      };
    } catch (error) {
      logger.error('Error adding directory to IPFS:', error);
      throw error;
    }
  }

  /**
   * Add JSON data to IPFS
   * @param {Object} data - JSON data
   * @param {string} fileName - Name of the file (optional)
   * @returns {Promise<Object>} IPFS file info
   */
  async addJson(data, fileName = 'data.json') {
    this.ensureInitialized();

    try {
      // Convert data to JSON string
      const jsonString = JSON.stringify(data, null, 2);

      // Add JSON to IPFS
      return await this.addFile(jsonString, fileName);
    } catch (error) {
      logger.error('Error adding JSON to IPFS:', error);
      throw error;
    }
  }

  /**
   * Get a file from IPFS
   * @param {string} cid - Content identifier
   * @returns {Promise<Buffer>} File content
   */
  async getFile(cid) {
    this.ensureInitialized();

    try {
      // If in mock mode, return a mock response
      if (this.mockMode) {
        logger.info(`Mock mode: Would get file from IPFS with CID: ${cid}`);
        // Generate some mock content based on the CID
        const mockContent = `Mock content for CID: ${cid}\nGenerated at: ${new Date().toISOString()}`;
        return Buffer.from(mockContent);
      }

      // Get file from IPFS
      const chunks = [];
      for await (const chunk of this.client.cat(cid)) {
        chunks.push(chunk);
      }

      // Combine chunks into a single buffer
      return Buffer.concat(chunks);
    } catch (error) {
      logger.error(`Error getting file from IPFS (${cid}):`, error);
      throw error;
    }
  }

  /**
   * Get JSON data from IPFS
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} JSON data
   */
  async getJson(cid) {
    this.ensureInitialized();

    try {
      // If in mock mode, return a mock response
      if (this.mockMode) {
        logger.info(`Mock mode: Would get JSON from IPFS with CID: ${cid}`);
        // Generate some mock JSON based on the CID
        return {
          cid,
          mockData: true,
          timestamp: new Date().toISOString(),
          message: `This is mock JSON data for CID: ${cid}`,
        };
      }

      // Get file from IPFS
      const content = await this.getFile(cid);

      // Parse JSON
      return JSON.parse(content.toString());
    } catch (error) {
      logger.error(`Error getting JSON from IPFS (${cid}):`, error);
      throw error;
    }
  }

  /**
   * Pin a file on IPFS
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} Pin info
   */
  async pinFile(cid) {
    this.ensureInitialized();

    try {
      // If in mock mode, return a mock response
      if (this.mockMode) {
        logger.info(`Mock mode: Would pin file on IPFS with CID: ${cid}`);
        return {
          cid,
        };
      }

      // Pin file on IPFS
      const result = await this.client.pin.add(cid);

      logger.info(`File pinned on IPFS: ${result}`);

      return {
        cid: result.toString(),
      };
    } catch (error) {
      logger.error(`Error pinning file on IPFS (${cid}):`, error);
      throw error;
    }
  }

  /**
   * Unpin a file from IPFS
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} Unpin info
   */
  async unpinFile(cid) {
    this.ensureInitialized();

    try {
      // If in mock mode, return a mock response
      if (this.mockMode) {
        logger.info(`Mock mode: Would unpin file from IPFS with CID: ${cid}`);
        return {
          cid,
        };
      }

      // Unpin file from IPFS
      const result = await this.client.pin.rm(cid);

      logger.info(`File unpinned from IPFS: ${result}`);

      return {
        cid: result.toString(),
      };
    } catch (error) {
      logger.error(`Error unpinning file from IPFS (${cid}):`, error);
      throw error;
    }
  }

  /**
   * Calculate hash of a file
   * @param {string|Buffer} content - File content or path to file
   * @returns {Promise<string>} SHA-256 hash
   */
  async calculateFileHash(content) {
    try {
      let fileContent;

      // If content is a string path, read the file
      if (typeof content === 'string' && fs.existsSync(content)) {
        fileContent = fs.readFileSync(content);
      } else if (Buffer.isBuffer(content)) {
        fileContent = content;
      } else if (typeof content === 'string') {
        fileContent = Buffer.from(content);
      } else {
        throw new Error('Invalid content type');
      }

      // Calculate SHA-256 hash
      const hash = crypto.createHash('sha256');
      hash.update(fileContent);
      return hash.digest('hex');
    } catch (error) {
      logger.error('Error calculating file hash:', error);
      throw error;
    }
  }

  /**
   * Get IPFS URL for a CID
   * @param {string} cid - Content identifier
   * @returns {string} IPFS URL
   */
  getIpfsUrl(cid) {
    // Remove ipfs:// prefix if present
    const cleanCid = cid.replace(/^ipfs:\/\//, '');
    return `${this.gateway}/ipfs/${cleanCid}`;
  }

  /**
   * Get IPFS URI for a CID
   * @param {string} cid - Content identifier
   * @returns {string} IPFS URI
   */
  getIpfsUri(cid) {
    // Remove ipfs:// prefix if present
    const cleanCid = cid.replace(/^ipfs:\/\//, '');
    return `ipfs://${cleanCid}`;
  }
}

// Create and export singleton instance
const ipfsService = new IPFSService();
module.exports = ipfsService;
